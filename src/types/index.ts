export const TASK_STATUSES = ["todo", "in_progress", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["low", "medium", "high"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

/** A task as sent over the wire (JSON-safe). */
export interface Task {
  id: string;
  key: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  position: number;
  /** Calendar date "YYYY-MM-DD" with no time zone, or null. */
  dueDate: string | null;
  labels: string[];
  assigneeId: string | null;
  createdBy: string;
  updatedBy: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface Member {
  id: string;
  username: string;
  name: string;
  /** Deactivated members stay listed so history can still show their name. */
  active: boolean;
}

export type ReactionVisibility = "self" | "everyone";

export interface BoardSettings {
  reactionVisibility: ReactionVisibility;
}

export const REACTION_CATEGORIES = [
  "todo_to_in_progress",
  "in_progress_to_done",
  "done_to_in_progress",
  "in_progress_to_todo",
  "other_transition",
  /** The move to Done that leaves To Do and In Progress empty: the whole board is finished. */
  "all_done",
] as const;
export type ReactionCategory = (typeof REACTION_CATEGORIES)[number];

export const EVENT_TYPES = [
  "created",
  "edited",
  "assigned",
  "status_changed",
  "deleted",
  "moved",
  "settings_changed",
] as const;
export type BoardEventType = (typeof EVENT_TYPES)[number];

/** Event types shown in task history / the activity panel. */
export const HISTORY_EVENT_TYPES: BoardEventType[] = [
  "created",
  "edited",
  "assigned",
  "status_changed",
  "deleted",
];

export interface FieldChange {
  from: unknown;
  to: unknown;
}

export interface BoardEvent {
  id: string;
  type: BoardEventType;
  taskId: string | null;
  taskKey: string | null;
  taskTitle: string | null;
  actorId: string;
  at: string;
  changes: Record<string, FieldChange>;
  /** Present for status changes. */
  reaction: ReactionCategory | null;
  /** Task snapshot after the change; null for deletions and settings events. */
  task: Task | null;
  settings: BoardSettings | null;
}

export interface BoardSnapshot {
  tasks: Task[];
  members: Member[];
  settings: BoardSettings;
  /** Server time just before the data was read. */
  serverTime: string;
}

export interface SuccessBody<T> {
  success: true;
  data: T;
}
