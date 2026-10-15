import type { ReactionCategory, TaskStatus } from "@/types";

/**
 * Maps a status change to one of the five reaction categories.
 * Returns null when the status did not change (reordering inside a column).
 */
export function getReactionCategory(from: TaskStatus, to: TaskStatus): ReactionCategory | null {
  if (from === to) return null;
  if (from === "todo" && to === "in_progress") return "todo_to_in_progress";
  if (from === "in_progress" && to === "done") return "in_progress_to_done";
  if (from === "done" && to === "in_progress") return "done_to_in_progress";
  if (from === "in_progress" && to === "todo") return "in_progress_to_todo";
  return "other_transition";
}
