import { CalendarDays } from "lucide-react";
import { formatDueDate, isDueToday, isOverdue } from "@/lib/tasks/due-date";
import { cn } from "@/lib/utils";
import { PRIORITY_LABELS, type TaskPriority } from "@/types";

const PRIORITY_BARS: Record<TaskPriority, number> = { low: 1, medium: 2, high: 3 };
const PRIORITY_COLOR: Record<TaskPriority, string> = {
  low: "bg-priority-low",
  medium: "bg-priority-medium",
  high: "bg-priority-high",
};

export function PriorityIcon({ priority, className }: { priority: TaskPriority; className?: string }) {
  const filled = PRIORITY_BARS[priority];
  return (
    <span className={cn("inline-flex items-end gap-[2px]", className)} title={`${PRIORITY_LABELS[priority]} priority`}>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          aria-hidden
          className={cn("w-[3px] rounded-[1px]", i <= filled ? PRIORITY_COLOR[priority] : "bg-muted-foreground/25")}
          style={{ height: 4 + i * 3 }}
        />
      ))}
      <span className="sr-only">{PRIORITY_LABELS[priority]} priority</span>
    </span>
  );
}

export function DueDateChip({ dueDate, done, today }: { dueDate: string; done: boolean; today: string }) {
  const overdue = isOverdue(dueDate, done, today);
  const dueToday = !done && isDueToday(dueDate, today);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
        overdue
          ? "bg-destructive/12 text-destructive"
          : dueToday
            ? "bg-warning/12 text-warning"
            : "text-muted-foreground",
      )}
      data-overdue={overdue || undefined}
    >
      <CalendarDays className="size-3" aria-hidden />
      {formatDueDate(dueDate, today)}
      {overdue && <span className="sr-only">(overdue)</span>}
      {dueToday && <span className="sr-only">(due today)</span>}
    </span>
  );
}

export function LabelPill({ label }: { label: string }) {
  return (
    <span className="inline-flex max-w-full items-center truncate rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-secondary-foreground">
      {label}
    </span>
  );
}
