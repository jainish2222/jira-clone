import "server-only";
import { randomUUID } from "node:crypto";
import { MongoServerError, ObjectId, type ClientSession, type Filter } from "mongodb";
import { AppError } from "@/lib/errors/app-error";
import { getCollections, QUERY_MAX_TIME_MS, type Collections, type EventDoc, type TaskDoc } from "@/lib/mongodb";
import { formatTaskKey } from "@/lib/tasks/task-key";
import { positionBetween, renumberedPositions } from "@/lib/tasks/position";
import { getReactionCategory } from "@/lib/tasks/transitions";
import type { CreateTaskInput, ListTasksQuery, Placement, UpdateTaskInput } from "@/lib/validations/task";
import { assertActiveMember } from "@/services/members";
import { toBoardEvent, toTask } from "@/services/serializers";
import { inTransaction } from "@/services/transaction";
import type { BoardEvent, FieldChange, Task, TaskStatus } from "@/types";

/** Hard cap so one request can never load an unbounded collection. */
export const MAX_BOARD_TASKS = 5000;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseObjectId(id: string): ObjectId {
  if (!/^[a-f\d]{24}$/i.test(id)) throw new AppError("INVALID_ID");
  return new ObjectId(id);
}

function newEvent(partial: Omit<EventDoc, "_id" | "eventId" | "at" | "settings"> & { at: Date }): EventDoc {
  return { _id: new ObjectId(), eventId: randomUUID(), settings: null, ...partial };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listTasks(query: ListTasksQuery = {}): Promise<Task[]> {
  const { tasks } = await getCollections();
  const filter: Filter<TaskDoc> = {};
  if (query.status) filter.status = query.status;
  if (query.priority) filter.priority = query.priority;
  if (query.assignee === "unassigned") filter.assigneeId = null;
  else if (query.assignee) filter.assigneeId = new ObjectId(query.assignee);
  if (query.q) {
    const re = new RegExp(escapeRegex(query.q), "i");
    filter.$or = [{ title: re }, { description: re }, { key: re }];
  }
  const docs = await tasks
    .find(filter, { maxTimeMS: QUERY_MAX_TIME_MS, projection: { clientRequestId: 0, seq: 0 } })
    .sort({ status: 1, position: 1, _id: 1 })
    .limit(MAX_BOARD_TASKS)
    .toArray();
  return docs.map(toTask);
}

export async function getTask(id: string): Promise<Task> {
  const { tasks } = await getCollections();
  const doc = await tasks.findOne({ _id: parseObjectId(id) }, { maxTimeMS: QUERY_MAX_TIME_MS });
  if (!doc) throw new AppError("TASK_NOT_FOUND");
  return toTask(doc);
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export interface CreateResult {
  task: Task;
  event: BoardEvent | null;
  /** false when this was a replay of an earlier request with the same clientRequestId. */
  created: boolean;
}

export async function createTask(input: CreateTaskInput, actorId: string): Promise<CreateResult> {
  const actor = new ObjectId(actorId);
  const { tasks } = await getCollections();

  if (input.clientRequestId) {
    const existing = await tasks.findOne({ clientRequestId: input.clientRequestId }, { maxTimeMS: QUERY_MAX_TIME_MS });
    if (existing) return { task: toTask(existing), event: null, created: false };
  }
  const assigneeId = input.assigneeId ? new ObjectId(input.assigneeId) : null;
  if (assigneeId) await assertActiveMember(assigneeId);

  try {
    return await inTransaction(async (session, c) => {
      const counter = await c.counters.findOneAndUpdate(
        { _id: "task" },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: "after", session },
      );
      const seq = counter!.seq;
      await lockColumn(c, session, input.status);
      // New tasks go to the top of their column.
      const first = await c.tasks.findOne({ status: input.status }, { sort: { position: 1 }, session });
      const position = positionBetween(null, first?.position ?? null) as number;
      const now = new Date();
      const doc: TaskDoc = {
        _id: new ObjectId(),
        key: formatTaskKey(seq),
        seq,
        title: input.title,
        description: input.description,
        status: input.status,
        priority: input.priority,
        position,
        dueDate: input.dueDate,
        labels: input.labels,
        assigneeId,
        createdBy: actor,
        updatedBy: actor,
        version: 1,
        createdAt: now,
        updatedAt: now,
        completedAt: input.status === "done" ? now : null,
        ...(input.clientRequestId ? { clientRequestId: input.clientRequestId } : {}),
      };
      await c.tasks.insertOne(doc, { session });
      const event = newEvent({
        type: "created",
        taskId: doc._id,
        taskKey: doc.key,
        taskTitle: doc.title,
        actorId: actor,
        at: now,
        changes: {},
        reaction: null,
        task: withoutPrivateFields(doc),
      });
      await c.events.insertOne(event, { session });
      return { task: toTask(doc), event: toBoardEvent(event), created: true };
    });
  } catch (err) {
    // Two identical requests raced: the loser returns the winner's task.
    if (err instanceof MongoServerError && err.code === 11000 && input.clientRequestId) {
      const existing = await tasks.findOne({ clientRequestId: input.clientRequestId });
      if (existing) return { task: toTask(existing), event: null, created: false };
    }
    throw err;
  }
}

function withoutPrivateFields(doc: TaskDoc): TaskDoc {
  const { clientRequestId: _omit, ...rest } = doc;
  void _omit;
  return rest;
}

// ---------------------------------------------------------------------------
// Update (fields, status and/or position)
// ---------------------------------------------------------------------------

export interface UpdateResult {
  task: Task;
  events: BoardEvent[];
}

const EDITABLE_FIELDS = ["title", "description", "priority", "dueDate", "labels"] as const;

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function summarize(field: string, value: unknown): unknown {
  // Keep long text out of the activity log; the task itself holds the full value.
  if (field === "description" && typeof value === "string" && value.length > 140) return `${value.slice(0, 140)}…`;
  return value;
}

export async function updateTask(id: string, input: UpdateTaskInput, actorId: string): Promise<UpdateResult> {
  const _id = parseObjectId(id);
  const actor = new ObjectId(actorId);
  if (input.assigneeId) await assertActiveMember(new ObjectId(input.assigneeId));

  return inTransaction(async (session, c) => {
    const doc = await c.tasks.findOne({ _id }, { session });
    if (!doc) throw new AppError("TASK_NOT_FOUND");
    if (doc.version !== input.version) {
      throw new AppError("VERSION_CONFLICT", { details: { task: toTask(doc) } });
    }

    const now = new Date();
    const set: Partial<TaskDoc> = {};
    const editChanges: Record<string, FieldChange> = {};

    for (const field of EDITABLE_FIELDS) {
      const next = input[field];
      if (next !== undefined && !sameValue(next, doc[field])) {
        (set as Record<string, unknown>)[field] = next;
        editChanges[field] = { from: summarize(field, doc[field]), to: summarize(field, next) };
      }
    }

    let assigneeChange: FieldChange | null = null;
    if (input.assigneeId !== undefined) {
      const current = doc.assigneeId?.toHexString() ?? null;
      if (input.assigneeId !== current) {
        set.assigneeId = input.assigneeId ? new ObjectId(input.assigneeId) : null;
        assigneeChange = { from: current, to: input.assigneeId };
      }
    }

    const targetStatus: TaskStatus = input.status ?? doc.status;
    const statusChanged = targetStatus !== doc.status;
    if (statusChanged || input.placement) {
      const rebalanced: EventDoc[] = [];
      const position = await computePosition(c, session, _id, targetStatus, input.placement, actor, now, rebalanced);
      if (position !== doc.position || statusChanged) set.position = position;
      if (rebalanced.length) await c.events.insertMany(rebalanced, { session });
    }
    if (statusChanged) {
      set.status = targetStatus;
      set.completedAt = targetStatus === "done" ? now : null;
    }

    if (Object.keys(set).length === 0) {
      // Nothing changed (e.g. a repeated request): succeed without a new version or event.
      return { task: toTask(doc), events: [] };
    }

    set.updatedAt = now;
    set.updatedBy = actor;
    const updated = await c.tasks.findOneAndUpdate(
      { _id, version: doc.version },
      { $set: set, $inc: { version: 1 } },
      { session, returnDocument: "after" },
    );
    if (!updated) throw new AppError("VERSION_CONFLICT", { details: { task: toTask(doc) } });

    const snapshot = withoutPrivateFields(updated);
    const base = { taskId: _id, taskKey: updated.key, taskTitle: updated.title, actorId: actor, at: now, task: snapshot };
    const events: EventDoc[] = [];
    if (statusChanged) {
      // Finishing the last open task earns the special "board cleared" reaction.
      const boardCleared =
        targetStatus === "done" &&
        (await c.tasks.countDocuments({ status: { $in: ["todo", "in_progress"] } }, { session, limit: 1 })) === 0;
      events.push(
        newEvent({
          ...base,
          type: "status_changed",
          changes: { status: { from: doc.status, to: targetStatus } },
          reaction: boardCleared ? "all_done" : getReactionCategory(doc.status, targetStatus),
        }),
      );
    }
    if (assigneeChange) {
      events.push(newEvent({ ...base, type: "assigned", changes: { assigneeId: assigneeChange }, reaction: null }));
    }
    if (Object.keys(editChanges).length) {
      events.push(newEvent({ ...base, type: "edited", changes: editChanges, reaction: null }));
    }
    if (events.length === 0) {
      events.push(
        newEvent({ ...base, type: "moved", changes: { position: { from: doc.position, to: updated.position } }, reaction: null }),
      );
    }
    await c.events.insertMany(events, { session });
    return { task: toTask(updated), events: events.map(toBoardEvent) };
  });
}

/**
 * Writes a per-column lock document inside the transaction. Two transactions that
 * place cards in the same column now conflict, and the driver retries the later
 * one, which then sees the first card — so simultaneous drops never share a position.
 */
async function lockColumn(c: Collections, session: ClientSession, status: TaskStatus) {
  await c.counters.updateOne({ _id: `column:${status}` }, { $inc: { seq: 1 } }, { upsert: true, session });
}

/**
 * Works out where a task lands in `status`. The server decides from the
 * neighbours' *current* positions, so two people dropping cards at the same
 * time still end up with one consistent order.
 */
async function computePosition(
  c: Collections,
  session: ClientSession,
  selfId: ObjectId,
  status: TaskStatus,
  placement: Placement | undefined,
  actor: ObjectId,
  now: Date,
  rebalanceEvents: EventDoc[],
  attempt = 0,
): Promise<number> {
  if (attempt === 0) await lockColumn(c, session, status);
  const inColumn = { status, _id: { $ne: selfId } };
  const neighbour = async (id: string | null | undefined) => {
    if (!id) return null;
    const oid = new ObjectId(id);
    if (oid.equals(selfId)) return null;
    // Only counts if it is still in the target column right now.
    return c.tasks.findOne({ _id: oid, status }, { session });
  };
  const prev = await neighbour(placement?.prevId);
  const next = prev ? null : await neighbour(placement?.nextId);

  let lower: number | null;
  let upper: number | null;
  if (prev) {
    lower = prev.position;
    const after = await c.tasks.findOne(
      { ...inColumn, position: { $gt: prev.position } },
      { sort: { position: 1, _id: 1 }, session },
    );
    upper = after?.position ?? null;
  } else if (next) {
    upper = next.position;
    const before = await c.tasks.findOne(
      { ...inColumn, position: { $lt: next.position } },
      { sort: { position: -1, _id: -1 }, session },
    );
    lower = before?.position ?? null;
  } else {
    // No usable neighbours (empty column, or they moved away): append to the end.
    const last = await c.tasks.findOne(inColumn, { sort: { position: -1, _id: -1 }, session });
    lower = last?.position ?? null;
    upper = null;
  }

  const position = positionBetween(lower, upper);
  if (position !== null) return position;
  if (attempt > 0) throw new AppError("INTERNAL_ERROR", { message: "Could not order the column." });

  // The gap is exhausted: renumber the column, then try again.
  const column = await c.tasks.find(inColumn, { session }).sort({ position: 1, _id: 1 }).toArray();
  const positions = renumberedPositions(column.length);
  for (let i = 0; i < column.length; i++) {
    const updated = await c.tasks.findOneAndUpdate(
      { _id: column[i]._id },
      { $set: { position: positions[i], updatedAt: now }, $inc: { version: 1 } },
      { session, returnDocument: "after" },
    );
    if (updated) {
      rebalanceEvents.push(
        newEvent({
          type: "moved",
          taskId: updated._id,
          taskKey: updated.key,
          taskTitle: updated.title,
          actorId: actor,
          at: now,
          changes: {},
          reaction: null,
          task: withoutPrivateFields(updated),
        }),
      );
    }
  }
  return computePosition(c, session, selfId, status, placement, actor, now, rebalanceEvents, attempt + 1);
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteTask(id: string, actorId: string, expectedVersion?: number): Promise<BoardEvent> {
  const _id = parseObjectId(id);
  const actor = new ObjectId(actorId);
  return inTransaction(async (session, c) => {
    const doc = await c.tasks.findOne({ _id }, { session });
    if (!doc) throw new AppError("TASK_NOT_FOUND");
    if (expectedVersion !== undefined && doc.version !== expectedVersion) {
      throw new AppError("VERSION_CONFLICT", { details: { task: toTask(doc) } });
    }
    await c.tasks.deleteOne({ _id }, { session });
    const event = newEvent({
      type: "deleted",
      taskId: _id,
      taskKey: doc.key,
      taskTitle: doc.title,
      actorId: actor,
      at: new Date(),
      changes: { status: { from: doc.status, to: null } },
      reaction: null,
      task: null,
    });
    await c.events.insertOne(event, { session });
    return toBoardEvent(event);
  });
}
