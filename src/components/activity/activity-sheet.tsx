"use client";

import { useMemo } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useActivity } from "@/hooks/use-activity";
import { EventList, mergeEvents } from "@/components/tasks/task-history";
import type { BoardEvent, Member } from "@/types";

export function ActivitySheet({
  open,
  onOpenChange,
  membersById,
  liveActivity,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  membersById: Map<string, Member>;
  liveActivity: BoardEvent[];
}) {
  const { events, loading, error } = useActivity(open);
  const merged = useMemo(() => mergeEvents(events, liveActivity).slice(0, 80), [events, liveActivity]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle>Recent activity</SheetTitle>
          <SheetDescription>What the team has been up to.</SheetDescription>
        </SheetHeader>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-2">
          <EventList events={merged} membersById={membersById} loading={loading} error={error} emptyText="Nothing has happened yet. Go make some tasks!" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
