"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { LiveStatus } from "./use-live-updates";

const COPY: Record<LiveStatus, { label: string; hint: string; dot: string }> = {
  live: { label: "Live", hint: "Changes from your team appear instantly.", dot: "bg-success" },
  connecting: { label: "Connecting", hint: "Connecting to live updates…", dot: "bg-muted-foreground animate-pulse" },
  reconnecting: {
    label: "Reconnecting",
    hint: "Live updates paused. You can keep working; we'll catch up when we reconnect.",
    dot: "bg-warning animate-pulse",
  },
  offline: { label: "Offline", hint: "You're offline. Changes can't be saved until you reconnect.", dot: "bg-destructive" },
};

export function ConnectionStatus({ status }: { status: LiveStatus }) {
  const c = COPY[status];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium text-muted-foreground"
          role="status"
          aria-live="polite"
          data-testid="connection-status"
          data-status={status}
          tabIndex={0}
        >
          <span aria-hidden className={cn("size-1.5 rounded-full", c.dot)} />
          <span className="hidden sm:inline">{c.label}</span>
          <span className="sr-only sm:hidden">{c.label}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{c.hint}</TooltipContent>
    </Tooltip>
  );
}
