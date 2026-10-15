"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CloudOff } from "lucide-react";
import { ActivitySheet } from "@/components/activity/activity-sheet";
import { ReactionProvider } from "@/components/reactions/reaction-provider";
import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";
import { TaskDetailSheet } from "@/components/tasks/task-detail-sheet";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { api, onUnauthorized } from "@/lib/api-client";
import { todayDateOnly } from "@/lib/tasks/due-date";
import { groupByStatus, isFiltering, matchesFilters, summarize } from "@/lib/tasks/filter";
import type { BoardSnapshot, Member, TaskStatus } from "@/types";
import { AppHeader } from "./app-header";
import { BoardColumns } from "./board-columns";
import { BoardToolbar, type AssigneeFilter, type PriorityFilter } from "./board-toolbar";
import { useBoard } from "./use-board";
import { useLiveUpdates } from "./use-live-updates";

function subscribeToClock(cb: () => void) {
  const t = setInterval(cb, 60_000);
  return () => clearInterval(t);
}

export function BoardApp({ initial, me }: { initial: BoardSnapshot; me: Member }) {
  return (
    <ReactionProvider>
      <Board initial={initial} me={me} />
    </ReactionProvider>
  );
}

function Board({ initial, me }: { initial: BoardSnapshot; me: Member }) {
  const board = useBoard(initial, me);
  const { state } = board;

  // Session expired or revoked elsewhere: go back to sign-in.
  useEffect(() => {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload clears board state
    onUnauthorized(() => window.location.assign("/login?expired=1"));
    return () => onUnauthorized(null);
  }, []);

  const lastSessionCheck = useRef(0);
  const liveStatus = useLiveUpdates({
    onEvent: board.handleEvent,
    onSync: board.refetch,
    onError: () => {
      // EventSource hides HTTP status codes; a cheap request tells us if the session is still valid.
      if (Date.now() - lastSessionCheck.current < 15_000) return;
      lastSessionCheck.current = Date.now();
      void api("/api/settings").catch(() => undefined);
    },
  });

  // "Today" in the viewer's own time zone (server render uses the server's date).
  const today = useSyncExternalStore(subscribeToClock, () => todayDateOnly(), () => initial.serverTime.slice(0, 10));

  // ---- Filters -------------------------------------------------------------
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState<PriorityFilter>("all");
  const [assignee, setAssignee] = useState<AssigneeFilter>("all");
  const debouncedSearch = useDebouncedValue(search, 150);
  const filtering = isFiltering({ search: debouncedSearch, priority, assignee });

  const allTasks = useMemo(() => Object.values(state.tasks), [state.tasks]);
  const totals = useMemo(() => {
    const g = groupByStatus(allTasks);
    return { todo: g.todo.length, in_progress: g.in_progress.length, done: g.done.length };
  }, [allTasks]);
  const columns = useMemo(() => {
    const visible = filtering
      ? allTasks.filter((t) => matchesFilters(t, { search: debouncedSearch, priority, assignee, meId: me.id }))
      : allTasks;
    return groupByStatus(visible);
  }, [allTasks, filtering, debouncedSearch, priority, assignee, me.id]);
  const summary = useMemo(() => summarize(allTasks, today), [allTasks, today]);
  const visibleCount = columns.todo.length + columns.in_progress.length + columns.done.length;

  // ---- Dialogs ----------------------------------------------------------------
  const [createFor, setCreateFor] = useState<TaskStatus | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);
  // If someone else deletes the open task, this becomes null and the panel closes.
  const openTask = openTaskId ? (state.tasks[openTaskId] ?? null) : null;
  const [createSession, setCreateSession] = useState(0);
  const startCreate = useCallback((status: TaskStatus) => {
    setCreateSession((n) => n + 1);
    setCreateFor(status);
  }, []);
  const searchRef = useRef<HTMLInputElement>(null);

  const handleOpen = useCallback((id: string) => setOpenTaskId(id), []);
  const handleAdd = startCreate;

  // Keyboard shortcuts: "/" focuses search, "n" opens New task.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true], [role=dialog], [role=listbox], [role=menu]")) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        startCreate("todo");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [startCreate]);

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader
        me={me}
        liveStatus={liveStatus}
        unseenActivity={board.unseenActivity}
        visibility={state.settings.reactionVisibility}
        onVisibilityChange={board.setReactionVisibility}
        onOpenActivity={() => {
          setActivityOpen(true);
          board.markActivitySeen();
        }}
      />

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6">
        <BoardToolbar
          ref={searchRef}
          summary={summary}
          search={search}
          onSearchChange={setSearch}
          priority={priority}
          onPriorityChange={setPriority}
          assignee={assignee}
          onAssigneeChange={setAssignee}
          members={state.members}
          onNewTask={() => startCreate("todo")}
        />

        {liveStatus === "offline" && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/8 px-3.5 py-2.5 text-sm" role="alert">
            <CloudOff className="size-4 shrink-0 text-destructive" aria-hidden />
            You&apos;re offline. Changes can&apos;t be saved until you reconnect.
          </div>
        )}
        {board.syncError && liveStatus !== "offline" && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning/8 px-3.5 py-2.5 text-sm" role="status">
            <span>{board.syncError} The board may be out of date.</span>
            <button type="button" className="shrink-0 font-medium text-primary hover:underline" onClick={() => void board.refetch()}>
              Retry
            </button>
          </div>
        )}
        {filtering && visibleCount === 0 && (
          <p className="mb-4 rounded-xl border border-dashed px-4 py-3 text-center text-sm text-muted-foreground" role="status">
            No tasks match your search.{" "}
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => {
                setSearch("");
                setPriority("all");
                setAssignee("all");
              }}
            >
              Clear filters
            </button>
          </p>
        )}
        {allTasks.length === 0 && (
          <div className="mb-4 rounded-xl border border-dashed px-4 py-6 text-center">
            <p className="text-sm font-medium">Your board is empty.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create the first task, then drag it across the board to see what happens. 👀
            </p>
          </div>
        )}

        <BoardColumns
          columns={columns}
          totals={totals}
          tasksById={state.tasks}
          membersById={board.membersById}
          pending={state.pending}
          today={today}
          filtering={filtering}
          onMove={board.moveTask}
          onOpen={handleOpen}
          onAdd={handleAdd}
        />
      </main>

      <CreateTaskDialog
        key={createSession}
        open={createFor !== null}
        initialStatus={createFor ?? "todo"}
        members={state.members}
        onOpenChange={(o) => !o && setCreateFor(null)}
        onCreate={board.createTask}
      />
      <TaskDetailSheet
        task={openTask}
        members={state.members}
        membersById={board.membersById}
        liveActivity={board.liveActivity}
        onClose={() => setOpenTaskId(null)}
        onSave={board.updateTask}
        onDelete={board.deleteTask}
      />
      <ActivitySheet open={activityOpen} onOpenChange={setActivityOpen} membersById={board.membersById} liveActivity={board.liveActivity} />
    </div>
  );
}
