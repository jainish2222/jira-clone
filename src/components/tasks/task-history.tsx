"use client";

import { MemberAvatar } from "@/components/board/member-avatar";
import { useNow } from "@/hooks/use-now";
import { describeEvent, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BoardEvent, Member } from "@/types";

export function EventRow({
  event,
  membersById,
  now,
  showTask = true,
}: {
  event: BoardEvent;
  membersById: Map<string, Member>;
  now: number;
  showTask?: boolean;
}) {
  const actor = membersById.get(event.actorId);
  let text = describeEvent(event, membersById);
  if (!showTask && event.taskKey) text = text.replace(` ${event.taskKey}`, "");
  return (
    <li className="flex gap-3 py-2.5">
      {actor ? (
        <MemberAvatar member={actor} size={24} className="mt-0.5" />
      ) : (
        <span className="mt-0.5 size-6 shrink-0 rounded-full bg-muted" aria-hidden />
      )}
      <div className="min-w-0 flex-1 text-sm leading-snug">
        <p className="wrap-break-word">
          <span className="font-medium">{actor?.name ?? "A former teammate"}</span>{" "}
          <span className="text-muted-foreground">{text}</span>
        </p>
        {showTask && event.taskTitle && <p className="truncate text-xs text-muted-foreground">{event.taskTitle}</p>}
      </div>
      <time dateTime={event.at} className="shrink-0 pt-0.5 text-xs text-muted-foreground tabular-nums" title={new Date(event.at).toLocaleString()}>
        {relativeTime(event.at, now)}
      </time>
    </li>
  );
}

export function EventList({
  events,
  membersById,
  loading,
  error,
  showTask,
  emptyText,
  className,
}: {
  events: BoardEvent[];
  membersById: Map<string, Member>;
  loading: boolean;
  error: string | null;
  showTask?: boolean;
  emptyText: string;
  className?: string;
}) {
  const now = useNow();
  if (loading && events.length === 0) {
    return (
      <div className={cn("space-y-3 py-2", className)} aria-busy>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex animate-pulse gap-3">
            <div className="size-6 rounded-full bg-muted" />
            <div className="h-4 flex-1 rounded bg-muted" />
          </div>
        ))}
      </div>
    );
  }
  if (error && events.length === 0) return <p className={cn("py-3 text-sm text-muted-foreground", className)}>{error}</p>;
  if (events.length === 0) return <p className={cn("py-3 text-sm text-muted-foreground", className)}>{emptyText}</p>;
  return (
    <ol className={cn("divide-y divide-border/70", className)}>
      {events.map((e) => (
        <EventRow key={e.id} event={e} membersById={membersById} now={now} showTask={showTask} />
      ))}
    </ol>
  );
}

/** Merge fetched history with live events, newest first, without duplicates. */
export function mergeEvents(fetched: BoardEvent[], live: BoardEvent[]): BoardEvent[] {
  const byId = new Map<string, BoardEvent>();
  for (const e of [...live, ...fetched]) if (!byId.has(e.id)) byId.set(e.id, e);
  return [...byId.values()].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
