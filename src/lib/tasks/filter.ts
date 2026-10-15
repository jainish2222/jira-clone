import { compareByPosition } from "@/lib/tasks/position";
import { isOverdue } from "@/lib/tasks/due-date";
import { TASK_STATUSES, type Task, type TaskPriority, type TaskStatus } from "@/types";

export interface TaskFilters {
  search: string;
  priority: "all" | TaskPriority;
  /** "all", "me", "unassigned" or a member id */
  assignee: string;
  meId: string;
}

export function isFiltering(f: Pick<TaskFilters, "search" | "priority" | "assignee">): boolean {
  return f.search.trim() !== "" || f.priority !== "all" || f.assignee !== "all";
}

export function matchesFilters(task: Task, f: TaskFilters): boolean {
  if (f.priority !== "all" && task.priority !== f.priority) return false;
  if (f.assignee === "me" && task.assigneeId !== f.meId) return false;
  if (f.assignee === "unassigned" && task.assigneeId !== null) return false;
  if (!["all", "me", "unassigned"].includes(f.assignee) && task.assigneeId !== f.assignee) return false;
  const q = f.search.trim().toLowerCase();
  if (q) {
    const haystack = `${task.key} ${task.title} ${task.description} ${task.labels.join(" ")}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

/** Groups tasks into the three columns, ordered by position (ties broken by id, like the server). */
export function groupByStatus(tasks: Task[]): Record<TaskStatus, Task[]> {
  const columns: Record<TaskStatus, Task[]> = { todo: [], in_progress: [], done: [] };
  for (const t of tasks) columns[t.status].push(t);
  for (const s of TASK_STATUSES) columns[s].sort(compareByPosition);
  return columns;
}

export function summarize(tasks: Task[], today: string) {
  let done = 0;
  let overdue = 0;
  for (const t of tasks) {
    if (t.status === "done") done++;
    if (isOverdue(t.dueDate, t.status === "done", today)) overdue++;
  }
  return { total: tasks.length, done, overdue };
}
