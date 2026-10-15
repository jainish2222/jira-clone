"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { STATUS_LABELS, type Member, type Task, type TaskStatus } from "@/types";
import { SortableTaskCard } from "./task-card";

const STATUS_DOT: Record<TaskStatus, string> = {
  todo: "bg-muted-foreground/60",
  in_progress: "bg-primary",
  done: "bg-success",
};

interface BoardColumnProps {
  status: TaskStatus;
  tasks: Task[];
  totalCount: number;
  membersById: Map<string, Member>;
  pending: Record<string, number>;
  today: string;
  filtering: boolean;
  /** True while a dragged card is hovering anywhere over this column. */
  isDropTarget: boolean;
  onOpen(taskId: string): void;
  onAdd(status: TaskStatus): void;
}

export function BoardColumn({
  status,
  tasks,
  totalCount,
  membersById,
  pending,
  today,
  filtering,
  isDropTarget,
  onOpen,
  onAdd,
}: BoardColumnProps) {
  const { setNodeRef, isOver: isOverEmptyArea } = useDroppable({ id: `column:${status}`, data: { type: "column", status } });
  const isOver = isOverEmptyArea || isDropTarget;
  const headingId = `column-${status}-heading`;

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "flex min-h-[180px] flex-col rounded-2xl border bg-column/80 transition-colors md:max-h-[calc(100dvh-210px)]",
        isOver && "border-primary/40 bg-primary/[0.04]",
      )}
      data-testid={`column-${status}`}
    >
      <header className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-3">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className={cn("size-2 rounded-full", STATUS_DOT[status])} />
          <h2 id={headingId} className="text-sm font-semibold tracking-tight">
            {STATUS_LABELS[status]}
          </h2>
          <span
            className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/12 px-1.5 text-[11px] font-semibold text-primary tabular-nums"
            aria-label={filtering ? `${tasks.length} of ${totalCount} tasks shown` : `${totalCount} tasks`}
            data-testid={`column-${status}-count`}
          >
            {filtering ? `${tasks.length}/${totalCount}` : totalCount}
          </span>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={() => onAdd(status)} aria-label={`Add task to ${STATUS_LABELS[status]}`}>
              <Plus />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Add task</TooltipContent>
        </Tooltip>
      </header>

      <div ref={setNodeRef} className="scrollbar-thin flex-1 overflow-y-auto px-2.5 pb-2.5">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy} id={status}>
          <ol className="flex min-h-[96px] flex-col gap-2" aria-labelledby={headingId}>
            {tasks.map((task) => (
              <SortableTaskCard
                key={task.id}
                task={task}
                assignee={task.assigneeId ? membersById.get(task.assigneeId) : undefined}
                today={today}
                pending={!!pending[task.id]}
                onOpen={onOpen}
              />
            ))}
            {tasks.length === 0 && (
              <li
                className={cn(
                  "flex min-h-[96px] list-none flex-col items-center justify-center rounded-xl border border-dashed px-4 text-center text-xs text-muted-foreground",
                  isOver && "border-primary/50 text-primary",
                )}
              >
                {isOver ? "Drop it here" : filtering ? "No matching tasks" : status === "done" ? "Nothing finished yet" : "No tasks yet"}
              </li>
            )}
          </ol>
        </SortableContext>
      </div>
    </section>
  );
}
