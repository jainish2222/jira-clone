"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { useDevicePreference } from "@/hooks/use-media-preferences";
import type { ReactionCategory, TaskStatus } from "@/types";
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
  soundEnabled: boolean;
  setSoundEnabled(v: boolean): void;
}

const ReactionContext = createContext<ReactionContextValue | null>(null);

const MAX_REMEMBERED = 300;

export function ReactionProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<ReactionRequest | null>(null);
  const [soundEnabled, setSoundEnabled] = useDevicePreference("tasklol:sound", true);
  const played = useRef<string[]>([]);

  const play = useCallback((request: ReactionRequest) => {
    if (played.current.includes(request.eventId)) return;
    played.current.push(request.eventId);
    if (played.current.length > MAX_REMEMBERED) played.current.splice(0, played.current.length - MAX_REMEMBERED);
    // Only one reaction at a time: a newer one replaces whatever is showing.
    setCurrent(request);
  }, []);

  const dismiss = useCallback((eventId: string) => {
    setCurrent((c) => (c?.eventId === eventId ? null : c));
  }, []);

  const value = useMemo(() => ({ play, soundEnabled, setSoundEnabled }), [play, soundEnabled, setSoundEnabled]);

  return (
    <ReactionContext.Provider value={value}>
      {children}
      {current && (
        <ReactionOverlay
          key={current.eventId}
          reaction={current}
          soundEnabled={soundEnabled}
          onDismiss={() => dismiss(current.eventId)}
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
