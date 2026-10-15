"use client";

import { memo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import type { Member, Task } from "@/types";
import { AssigneeBadge } from "./member-avatar";
import { DueDateChip, LabelPill, PriorityIcon } from "./task-meta";

interface CardContentProps {
  task: Task;
  assignee: Member | undefined;
  today: string;
}

/** The visual card, shared by the sortable item and the drag overlay. */
export function TaskCardContent({ task, assignee, today }: CardContentProps) {
  const done = task.status === "done";
  const hasFooter = !!assignee || !!task.dueDate;
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] tracking-tight text-muted-foreground">{task.key}</span>
        <PriorityIcon priority={task.priority} />
      </div>
      <p className={cn("mt-1.5 text-[13.5px] leading-snug font-medium wrap-break-word", done && "text-muted-foreground line-through decoration-muted-foreground/50")}>
        {task.title}
      </p>
      {task.description && (
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed wrap-break-word text-muted-foreground">{task.description}</p>
      )}
      {task.labels.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {task.labels.map((l) => (
            <LabelPill key={l} label={l} />
          ))}
        </div>
      )}
      {hasFooter && (
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/70 pt-2.5">
          {assignee ? <AssigneeBadge member={assignee} /> : <span />}
          {task.dueDate && <DueDateChip dueDate={task.dueDate} done={done} today={today} />}
        </div>
      )}
    </>
  );
}

interface SortableTaskCardProps extends CardContentProps {
  pending: boolean;
  onOpen(taskId: string): void;
}

export const SortableTaskCard = memo(function SortableTaskCard({ task, assignee, today, pending, onOpen }: SortableTaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, active } = useSortable({
    id: task.id,
    data: { type: "task", status: task.status },
    // A card whose save is still in flight can't be dragged again (prevents duplicate updates).
    disabled: pending,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className="list-none"
      data-testid="task-card"
      data-task-id={task.id}
      data-task-key={task.key}
    >
      <div
        {...attributes}
        {...listeners}
        aria-roledescription="Task card. Press space to pick up and move."
        aria-label={`${task.key}: ${task.title}`}
        aria-busy={pending || undefined}
        onClick={() => onOpen(task.id)}
        onKeyDown={(e) => {
          // Enter opens the task, except during a keyboard drag where it drops the card.
          if (e.key === "Enter" && !active) {
            e.preventDefault();
            onOpen(task.id);
            return;
          }
          listeners?.onKeyDown?.(e);
        }}
        className={cn(
          "group relative cursor-grab touch-manipulation rounded-xl border bg-card p-3.5 text-card-foreground shadow-xs transition-[border-color,box-shadow,opacity] outline-none select-none",
          "hover:border-foreground/15 hover:shadow-sm focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/25",
          isDragging && "border-dashed border-primary/50 bg-primary/5 opacity-50 shadow-none",
          pending && "cursor-progress",
        )}
      >
        <TaskCardContent task={task} assignee={assignee} today={today} />
        {pending && (
          <span aria-hidden className="absolute top-3 right-9 size-1.5 animate-pulse rounded-full bg-primary" title="Saving…" />
        )}
      </div>
    </li>
  );
});
