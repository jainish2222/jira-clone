import type { EventDoc, TaskDoc } from "@/lib/mongodb";
import type { BoardEvent, Task } from "@/types";

export function toTask(doc: TaskDoc): Task {
  return {
    id: doc._id.toHexString(),
    key: doc.key,
    title: doc.title,
    description: doc.description,
    status: doc.status,
    priority: doc.priority,
    position: doc.position,
    dueDate: doc.dueDate,
    labels: doc.labels,
    assigneeId: doc.assigneeId ? doc.assigneeId.toHexString() : null,
    createdBy: doc.createdBy.toHexString(),
    updatedBy: doc.updatedBy.toHexString(),
    version: doc.version,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    completedAt: doc.completedAt ? doc.completedAt.toISOString() : null,
  };
}

export function toBoardEvent(doc: EventDoc): BoardEvent {
  return {
    id: doc.eventId,
    type: doc.type,
    taskId: doc.taskId ? doc.taskId.toHexString() : null,
    taskKey: doc.taskKey,
    taskTitle: doc.taskTitle,
    actorId: doc.actorId.toHexString(),
    at: doc.at.toISOString(),
    changes: doc.changes,
    reaction: doc.reaction,
    task: doc.task ? toTask(doc.task) : null,
    settings: doc.settings,
  };
}
