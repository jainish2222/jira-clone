"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { STATUS_LABELS, TASK_STATUSES, type Member, type Task, type TaskStatus } from "@/types";
import { BoardColumn } from "./board-column";
import { TaskCardContent } from "./task-card";

type ColumnIds = Record<TaskStatus, string[]>;

interface BoardColumnsProps {
  columns: Record<TaskStatus, Task[]>;
  totals: Record<TaskStatus, number>;
  tasksById: Record<string, Task>;
  membersById: Map<string, Member>;
  pending: Record<string, number>;
  today: string;
  filtering: boolean;
  /** Every task is done (To Do and In Progress are empty). */
  allDone: boolean;
  onMove(taskId: string, toStatus: TaskStatus, prevId: string | null, nextId: string | null): void;
  onOpen(taskId: string): void;
  onAdd(status: TaskStatus): void;
}

function columnOf(id: UniqueIdentifier, ids: ColumnIds): TaskStatus | null {
  const key = String(id);
  if (key.startsWith("column:")) return key.slice(7) as TaskStatus;
  return TASK_STATUSES.find((s) => ids[s].includes(key)) ?? null;
}

function idsOf(columns: Record<TaskStatus, Task[]>): ColumnIds {
  return { todo: columns.todo.map((t) => t.id), in_progress: columns.in_progress.map((t) => t.id), done: columns.done.map((t) => t.id) };
}

export function BoardColumns({
  columns,
  totals,
  tasksById,
  membersById,
  pending,
  today,
  filtering,
  allDone,
  onMove,
  onOpen,
  onAdd,
}: BoardColumnsProps) {
  // While dragging we keep our own copy of the column order so cards can move
  // between columns before the drop; live updates keep flowing into `columns`.
  const [dragIds, setDragIds] = useState<ColumnIds | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const lastDragEnd = useRef(0);
  const dragIdsRef = useRef<ColumnIds | null>(null);
  const lastOverId = useRef<UniqueIdentifier | null>(null);
  const recentlyMovedToNewColumn = useRef(false);

  useEffect(() => {
    // Let the layout settle for a frame after a card switches columns.
    const raf = requestAnimationFrame(() => {
      recentlyMovedToNewColumn.current = false;
    });
    return () => cancelAnimationFrame(raf);
  }, [dragIds]);

  /**
   * Two steps, both stable while cards animate:
   *   1. which column is the pointer in (falls back to overlap when it's between columns);
   *   2. inside that column, the card whose centre is closest.
   * Hit-testing individual cards under the pointer flickers between neighbours of
   * different heights, which made the board re-render endlessly.
   * Right after a card changes column we also keep the previous target for a frame.
   */
  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const columnArgs = {
      ...args,
      droppableContainers: args.droppableContainers.filter((c) => String(c.id).startsWith("column:")),
    };
    const pointerHits = pointerWithin(columnArgs);
    const columnId = getFirstCollision(pointerHits.length > 0 ? pointerHits : rectIntersection(columnArgs), "id");
    if (columnId != null) {
      let overId: UniqueIdentifier = columnId;
      const ids = dragIdsRef.current;
      const items = ids ? ids[String(columnId).slice(7) as TaskStatus] : [];
      if (items.length > 0) {
        const closest = closestCenter({
          ...args,
          droppableContainers: args.droppableContainers.filter((c) => items.includes(String(c.id))),
        })[0]?.id;
        if (closest != null) overId = closest;
      }
      lastOverId.current = overId;
      return [{ id: overId }];
    }
    if (recentlyMovedToNewColumn.current) lastOverId.current = args.active.id;
    return lastOverId.current != null ? [{ id: lastOverId.current }] : [];
  }, []);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // Long-press on touch screens so normal scrolling still works.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    }),
  );

  const visible = useMemo<Record<TaskStatus, Task[]>>(() => {
    if (!dragIds) return columns;
    const pick = (ids: string[]) => ids.map((id) => tasksById[id]).filter(Boolean);
    return { todo: pick(dragIds.todo), in_progress: pick(dragIds.in_progress), done: pick(dragIds.done) };
  }, [dragIds, columns, tasksById]);

  const overStatus = dragIds && activeId ? columnOf(activeId, dragIds) : null;

  const handleDragStart = ({ active }: DragStartEvent) => {
    const ids = idsOf(columns);
    dragIdsRef.current = ids;
    setActiveId(String(active.id));
    setDragIds(ids);
  };

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    setDragIds((prev) => {
      if (!prev) return prev;
      const from = columnOf(active.id, prev);
      const to = columnOf(over.id, prev);
      if (!from || !to || from === to) return prev;
      recentlyMovedToNewColumn.current = true;
      const activeKey = String(active.id);
      const target = prev[to];
      const overIndex = target.indexOf(String(over.id));
      let index = target.length;
      if (overIndex >= 0) {
        const activeTop = active.rect.current.translated?.top ?? 0;
        const below = activeTop > over.rect.top + over.rect.height / 2;
        index = overIndex + (below ? 1 : 0);
      }
      const next = {
        ...prev,
        [from]: prev[from].filter((id) => id !== activeKey),
        [to]: [...target.slice(0, index), activeKey, ...target.slice(index)],
      };
      dragIdsRef.current = next;
      return next;
    });
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const current = dragIds;
    dragIdsRef.current = null;
    setDragIds(null);
    setActiveId(null);
    lastDragEnd.current = Date.now();
    if (!over || !current) return;

    const taskId = String(active.id);
    const task = tasksById[taskId];
    const to = columnOf(over.id, current);
    if (!task || !to) return;

    let list = current[to].filter((id) => tasksById[id]);
    const from = list.indexOf(taskId);
    const overIndex = String(over.id).startsWith("column:") ? list.length - 1 : list.indexOf(String(over.id));
    if (from >= 0 && overIndex >= 0 && from !== overIndex) list = arrayMove(list, from, overIndex);
    const index = list.indexOf(taskId);
    if (index < 0) return;

    // Dropped back where it started: nothing to save.
    const original = columns[task.status].map((t) => t.id);
    if (to === task.status && original.indexOf(taskId) === index && original.length === list.length) return;

    onMove(taskId, to, list[index - 1] ?? null, list[index + 1] ?? null);
  };

  const handleDragCancel = () => {
    dragIdsRef.current = null;
    setDragIds(null);
    setActiveId(null);
    lastDragEnd.current = Date.now();
  };

  // A click right after a drop is the end of the drag, not a request to open the card.
  const handleOpen = useCallback(
    (taskId: string) => {
      if (Date.now() - lastDragEnd.current < 250) return;
      onOpen(taskId);
    },
    [onOpen],
  );

  const announcements = useMemo<Announcements>(() => {
    const title = (id: UniqueIdentifier) => tasksById[String(id)]?.title ?? "task";
    const where = (id: UniqueIdentifier | undefined) => {
      if (id === undefined) return "outside the board";
      const status = columnOf(id, dragIds ?? idsOf(columns));
      return status ? STATUS_LABELS[status] : "the board";
    };
    return {
      onDragStart: ({ active }) => `Picked up ${title(active.id)}.`,
      onDragOver: ({ active, over }) => (over ? `${title(active.id)} is over ${where(over.id)}.` : `${title(active.id)} is no longer over a column.`),
      onDragEnd: ({ active, over }) => (over ? `Dropped ${title(active.id)} in ${where(over.id)}.` : `${title(active.id)} was dropped outside the board.`),
      onDragCancel: ({ active }) => `Moving ${title(active.id)} was cancelled.`,
    };
  }, [tasksById, dragIds, columns]);

  const activeTask = activeId ? tasksById[activeId] : undefined;

  return (
    <DndContext
      id="board-dnd"
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            "To move a task, press space to pick it up. Use the arrow keys to move it within or between columns, then press space or enter to drop it, or escape to cancel. Press enter to open the task.",
        },
      }}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3" data-testid="board">
        {TASK_STATUSES.map((status) => (
          <BoardColumn
            key={status}
            status={status}
            tasks={visible[status]}
            totalCount={totals[status]}
            membersById={membersById}
            pending={pending}
            today={today}
            filtering={filtering}
            isDropTarget={overStatus === status}
            celebrate={allDone && !filtering && !activeId}
            onOpen={handleOpen}
            onAdd={onAdd}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
        {activeTask ? (
          // dnd-kit measures this outer box; the tilt lives on the inner one so it doesn't
          // widen the measured rect (which confused keyboard moves between columns).
          <div>
            <div className="rotate-[1.5deg] cursor-grabbing rounded-xl border border-primary/40 bg-card p-3.5 text-card-foreground shadow-2xl shadow-black/25 ring-1 ring-primary/20 motion-reduce:rotate-0">
              <TaskCardContent
                task={activeTask}
                assignee={activeTask.assigneeId ? membersById.get(activeTask.assigneeId) : undefined}
                today={today}
              />
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
