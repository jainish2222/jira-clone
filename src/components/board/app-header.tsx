"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { Activity, KeyRound, LogOut, Moon, Settings2, Sun } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChangePasswordDialog } from "@/components/account/change-password-dialog";
import { useReactions } from "@/components/reactions/reaction-provider";
import { api, friendlyError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { Member, ReactionVisibility } from "@/types";
import { ConnectionStatus } from "./connection-status";
import { MemberAvatar } from "./member-avatar";
import type { LiveStatus } from "./use-live-updates";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="inline-flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm shadow-primary/30">
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
          <path d="M6 8h4v2.4H6zM14 8h4v2.4h-4z" fill="currentColor" />
          <path d="M6 13.2c1.1 2.7 3.1 4 6 4s4.9-1.3 6-4z" fill="currentColor" />
        </svg>
      </span>
      <span>
        Task<span className="text-primary">LOL</span>
      </span>
    </span>
  );
}

function SegmentButton({ active, onClick, children }: { active: boolean; onClick(): void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function SettingsPopover({
  visibility,
  onVisibilityChange,
}: {
  visibility: ReactionVisibility;
  onVisibilityChange(v: ReactionVisibility): Promise<void>;
}) {
  const { soundEnabled, setSoundEnabled } = useReactions();
  const [saving, setSaving] = useState(false);
  const change = async (v: ReactionVisibility) => {
    if (v === visibility || saving) return;
    setSaving(true);
    try {
      await onVisibilityChange(v);
      toast.success(v === "everyone" ? "Everyone will see meme reactions." : "Reactions now only show to the mover.");
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Reaction settings">
              <Settings2 />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Reaction settings</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-72 space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium">Who sees meme reactions</p>
          <div className="flex gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Who sees meme reactions" aria-busy={saving}>
            <SegmentButton active={visibility === "self"} onClick={() => change("self")}>
              Only the mover
            </SegmentButton>
            <SegmentButton active={visibility === "everyone"} onClick={() => change("everyone")}>
              Everyone
            </SegmentButton>
          </div>
          <p className="text-xs text-muted-foreground">Applies to the whole team&apos;s board.</p>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Meme sound</p>
          <div className="flex gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Meme sound">
            <SegmentButton active={soundEnabled} onClick={() => setSoundEnabled(true)}>
              On
            </SegmentButton>
            <SegmentButton active={!soundEnabled} onClick={() => setSoundEnabled(false)}>
              Muted
            </SegmentButton>
          </div>
          <p className="text-xs text-muted-foreground">Only on this device.</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme !== "light";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" onClick={() => setTheme(dark ? "light" : "dark")} aria-label="Toggle theme">
          <Sun className="hidden dark:block" />
          <Moon className="dark:hidden" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{dark ? "Light mode" : "Dark mode"}</TooltipContent>
    </Tooltip>
  );
}

export function AppHeader({
  me,
  liveStatus,
  unseenActivity,
  visibility,
  onVisibilityChange,
  onOpenActivity,
}: {
  me: Member;
  liveStatus: LiveStatus;
  unseenActivity: number;
  visibility: ReactionVisibility;
  onVisibilityChange(v: ReactionVisibility): Promise<void>;
  onOpenActivity(): void;
}) {
  const [passwordOpen, setPasswordOpen] = useState(false);
  const logout = async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      // Full page load: drops all in-memory board state and the live connection.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/login");
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b bg-surface/85 backdrop-blur supports-[backdrop-filter]:bg-surface/70">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between gap-3 px-4 sm:px-6">
        <Logo />
        <div className="flex items-center gap-1 sm:gap-1.5">
          <ConnectionStatus status={liveStatus} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onOpenActivity} aria-label={unseenActivity ? `Activity, ${unseenActivity} new` : "Activity"} className="relative">
                <Activity />
                {unseenActivity > 0 && (
                  <span aria-hidden className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary ring-2 ring-surface" data-testid="activity-dot" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Team activity</TooltipContent>
          </Tooltip>
          <SettingsPopover visibility={visibility} onVisibilityChange={onVisibilityChange} />
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="ml-0.5 rounded-full" aria-label={`Account: ${me.name}`}>
                <MemberAvatar member={me} size={28} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <p className="text-sm font-medium">{me.name}</p>
                <p className="text-xs text-muted-foreground">@{me.username}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setPasswordOpen(true)}>
                <KeyRound />
                Change password
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={logout}>
                <LogOut />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </header>
  );
}
