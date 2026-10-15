/**
 * Due dates are calendar days ("YYYY-MM-DD") with no time or zone attached.
 * A task due on 2026-03-10 is due on that day wherever the viewer is, so we
 * never convert it to a Date at midnight UTC (which shifts the day in the Americas).
 */

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDateOnly(value: string): boolean {
  const m = DATE_ONLY.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1970 || y > 2999) return false;
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** Today's calendar date in the viewer's local time zone (or the given zone). */
export function todayDateOnly(now: Date = new Date(), timeZone?: string): string {
  if (timeZone) {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  }
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Overdue = due before today, and the task is not done. */
export function isOverdue(dueDate: string | null, isDone: boolean, today: string): boolean {
  if (!dueDate || isDone) return false;
  return dueDate < today; // ISO date strings compare correctly as text
}

export function isDueToday(dueDate: string | null, today: string): boolean {
  return dueDate !== null && dueDate === today;
}

/** "Mar 10" (or "Mar 10, 2027" when not in the current year). */
export function formatDueDate(dueDate: string, today: string): string {
  const [y, m, d] = dueDate.split("-").map(Number);
  const sameYear = today.slice(0, 4) === String(y);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
