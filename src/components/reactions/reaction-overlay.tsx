"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, X } from "lucide-react";
import type { ReactionConfig } from "@/config/reactions";
import { usePrefersReducedMotion } from "@/hooks/use-media-preferences";
import { cn } from "@/lib/utils";
import { STATUS_LABELS } from "@/types";
import type { ReactionRequest } from "./reaction-provider";
import { cachedUrl } from "./media-cache";
import { ReactionMediaView } from "./reaction-media";

const FADE_MS = 250;

/**
 * A short banner under the header. It never captures focus or blocks the board,
 * closes itself, and can be dismissed with the button or Esc.
 */
export function ReactionOverlay({
  reaction,
  config,
  soundEnabled,
  onDismiss,
}: {
  reaction: ReactionRequest;
  config: ReactionConfig;
  soundEnabled: boolean;
  onDismiss: () => void;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [muted, setMuted] = useState(!soundEnabled);
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  // Auto-dismiss.
  useEffect(() => {
    const t = setTimeout(() => dismissRef.current(), config.durationMs);
    return () => clearTimeout(t);
  }, [config.durationMs]);

  // Esc closes the reaction unless a dialog is open (Esc belongs to the dialog then).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) return;
      dismissRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Sound: created only when a reaction shows (nothing preloads at startup).
  useEffect(() => {
    if (!config.sound) return;
    const audio = new Audio(cachedUrl(config.sound));
    audio.preload = "auto";
    audio.volume = 0.7;
    audio.muted = !soundEnabled;
    audioRef.current = audio;
    if (soundEnabled) {
      audio.play().catch(() => {
        // Autoplay policy: browsers block sound until the viewer interacts with the page.
        setSoundBlocked(true);
      });
    }
    return () => {
      const a = audio;
      const startVolume = a.volume;
      const steps = 5;
      let i = 0;
      const fade = setInterval(() => {
        i++;
        a.volume = Math.max(0, startVolume * (1 - i / steps));
        if (i >= steps) {
          clearInterval(fade);
          a.pause();
          a.src = "";
        }
      }, FADE_MS / steps);
      audioRef.current = null;
    };
  }, [config.sound, soundEnabled]);

  const toggleSound = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (muted || soundBlocked) {
      audio.muted = false;
      audio.play().then(
        () => {
          setMuted(false);
          setSoundBlocked(false);
        },
        () => setSoundBlocked(true),
      );
    } else {
      audio.muted = true;
      setMuted(true);
    }
  };

  const subline = reaction.isSelf
    ? `You moved ${reaction.taskKey} to ${STATUS_LABELS[reaction.toStatus]}`
    : `${reaction.actorName} moved ${reaction.taskKey} to ${STATUS_LABELS[reaction.toStatus]}`;

  return (
    // A wide, short banner that drops in just below the sticky header. It sits over the
    // toolbar and column titles, never over the task cards, so you can watch your ticket land.
    <div
      className="pointer-events-none fixed inset-x-0 top-16 z-40 flex justify-center px-4"
      data-testid="reaction-overlay"
      data-reaction={reaction.category}
    >
      <section
        aria-label="Meme reaction"
        className={cn(
          "pointer-events-auto relative flex w-full max-w-[540px] overflow-hidden rounded-2xl border bg-popover/95 text-popover-foreground shadow-2xl shadow-black/30 backdrop-blur",
          !reducedMotion && "animate-in fade-in-0 slide-in-from-top-4 duration-300",
        )}
      >
        <ReactionMediaView
          config={config}
          reducedMotion={reducedMotion}
          className="aspect-video w-[44%] shrink-0 sm:w-[224px]"
        />

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 py-3 pr-3 pl-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[15px] leading-snug font-semibold tracking-tight sm:text-base" data-testid="reaction-caption">
              {config.caption}
            </p>
            <div className="-mt-0.5 -mr-0.5 flex shrink-0 gap-1">
              {config.sound && (
                <button
                  type="button"
                  onClick={toggleSound}
                  className="flex h-7 items-center gap-1 rounded-full px-2 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                  aria-label={muted || soundBlocked ? "Play sound" : "Mute sound"}
                >
                  {muted || soundBlocked ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
                </button>
              )}
              <button
                type="button"
                onClick={onDismiss}
                className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                aria-label="Dismiss reaction"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
          <p className="truncate text-xs text-muted-foreground" title={reaction.taskTitle}>
            {subline}
          </p>
          {soundBlocked && !muted && (
            <button
              type="button"
              onClick={toggleSound}
              className="mt-1 self-start rounded-full bg-primary/12 px-2.5 py-1 text-xs font-medium text-primary transition hover:bg-primary/20"
            >
              Tap for sound
            </button>
          )}
        </div>

        {!reducedMotion && (
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-primary/70"
            style={{ animation: `reaction-progress ${config.durationMs}ms linear forwards` }}
          />
        )}
        <p className="sr-only" role="status" aria-live="polite">
          {config.caption} {subline}
        </p>
      </section>
    </div>
  );
}
