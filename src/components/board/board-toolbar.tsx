"use client";

import { forwardRef } from "react";
import { Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PriorityIcon } from "./task-meta";
import { PRIORITY_LABELS, TASK_PRIORITIES, type Member, type TaskPriority } from "@/types";

export type PriorityFilter = "all" | TaskPriority;
export type AssigneeFilter = "all" | "me" | "unassigned" | string;

export interface BoardSummary {
  total: number;
  done: number;
  overdue: number;
}

interface ToolbarProps {
  summary: BoardSummary;
  search: string;
  onSearchChange(v: string): void;
  priority: PriorityFilter;
  onPriorityChange(v: PriorityFilter): void;
  assignee: AssigneeFilter;
  onAssigneeChange(v: AssigneeFilter): void;
  members: Member[];
  onNewTask(): void;
}

export const BoardToolbar = forwardRef<HTMLInputElement, ToolbarProps>(function BoardToolbar(
  { summary, search, onSearchChange, priority, onPriorityChange, assignee, onAssigneeChange, members, onNewTask },
  searchRef,
) {
  const pct = summary.total ? Math.round((summary.done / summary.total) * 100) : 0;
  return (
    <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Team board</h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground" data-testid="board-summary">
          <span>
            {summary.total} {summary.total === 1 ? "task" : "tasks"}
          </span>
          <span aria-hidden>·</span>
          <span>
            {summary.done} done{summary.total > 0 && ` (${pct}%)`}
          </span>
          {summary.overdue > 0 && (
            <>
              <span aria-hidden>·</span>
              <span className="text-destructive">{summary.overdue} overdue</span>
            </>
          )}
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            ref={searchRef}
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search tasks…"
            aria-label="Search tasks"
            className="pr-14 pl-8 [&::-webkit-search-cancel-button]:hidden"
            maxLength={100}
          />
          {search ? (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute top-1/2 right-2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground sm:block">
              /
            </kbd>
          )}
        </div>
        <div className="flex gap-2">
          <Select value={priority} onValueChange={(v) => onPriorityChange(v as PriorityFilter)}>
            <SelectTrigger className="w-full sm:w-[132px]" aria-label="Filter by priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              {TASK_PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  <PriorityIcon priority={p} />
                  {PRIORITY_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={assignee} onValueChange={onAssigneeChange}>
            <SelectTrigger className="w-full sm:w-[140px]" aria-label="Filter by assignee">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone</SelectItem>
              <SelectItem value="me">Assigned to me</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {members
                .filter((m) => m.active)
                .map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Button onClick={onNewTask} className="shrink-0" data-testid="new-task">
            <Plus />
            New task
          </Button>
        </div>
      </div>
    </div>
  );
});
