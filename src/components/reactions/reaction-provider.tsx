"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { pickVariant, reactionAssetUrls, REACTIONS, type ReactionConfig } from "@/config/reactions";
import { useDevicePreference } from "@/hooks/use-media-preferences";
import type { ReactionCategory, TaskStatus } from "@/types";
import { preloadMedia } from "./media-cache";
import { ReactionOverlay } from "./reaction-overlay";

export interface ReactionRequest {
  /** The board event id — the same event never plays twice (reconnects, duplicate messages). */
  eventId: string;
  category: ReactionCategory;
  taskKey: string;
  taskTitle: string;
  toStatus: TaskStatus;
  actorName: string;
  isSelf: boolean;
}

interface ReactionContextValue {
  play(request: ReactionRequest): void;
  /** Hides a reaction that turned out to be wrong (e.g. an optimistic move that failed to save). */
  cancel(eventId: string): void;
  soundEnabled: boolean;
  setSoundEnabled(v: boolean): void;
}

const ReactionContext = createContext<ReactionContextValue | null>(null);

const MAX_REMEMBERED = 300;
/** Start background preloading shortly after the board has rendered. */
const PRELOAD_DELAY_MS = 1200;

interface Showing {
  request: ReactionRequest;
  config: ReactionConfig;
}

export function ReactionProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<Showing | null>(null);
  const [soundEnabled, setSoundEnabled] = useDevicePreference("tasklol:sound", true);
  const played = useRef<string[]>([]);
  const lastVariant = useRef<Partial<Record<ReactionCategory, number>>>({});

  useEffect(() => {
    const t = setTimeout(() => preloadMedia(reactionAssetUrls()), PRELOAD_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  const play = useCallback((request: ReactionRequest) => {
    if (played.current.includes(request.eventId)) return;
    played.current.push(request.eventId);
    if (played.current.length > MAX_REMEMBERED) played.current.splice(0, played.current.length - MAX_REMEMBERED);
    const variants = REACTIONS[request.category];
    const index = pickVariant(variants.length, lastVariant.current[request.category]);
    lastVariant.current[request.category] = index;
    // Only one reaction at a time: a newer one replaces whatever is showing.
    setCurrent({ request, config: variants[index] });
  }, []);

  const cancel = useCallback((eventId: string) => {
    setCurrent((c) => (c?.request.eventId === eventId ? null : c));
  }, []);

  const value = useMemo(() => ({ play, cancel, soundEnabled, setSoundEnabled }), [play, cancel, soundEnabled, setSoundEnabled]);

  return (
    <ReactionContext.Provider value={value}>
      {children}
      {current && (
        <ReactionOverlay
          key={current.request.eventId}
          reaction={current.request}
          config={current.config}
          soundEnabled={soundEnabled}
          onDismiss={() => cancel(current.request.eventId)}
        />
      )}
    </ReactionContext.Provider>
  );
}

export function useReactions(): ReactionContextValue {
  const ctx = useContext(ReactionContext);
  if (!ctx) throw new Error("useReactions must be used inside <ReactionProvider>");
  return ctx;
}
