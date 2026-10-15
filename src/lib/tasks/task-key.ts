export const TASK_KEY_PREFIX = "TASK";

/** Formats a sequence number as a readable key: 1 -> TASK-001, 1234 -> TASK-1234. */
export function formatTaskKey(sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new RangeError(`Invalid task sequence: ${sequence}`);
  }
  return `${TASK_KEY_PREFIX}-${String(sequence).padStart(3, "0")}`;
}
