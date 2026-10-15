"use client";

import { useEffect, useRef, useState } from "react";
import type { BoardEvent } from "@/types";

export type LiveStatus = "connecting" | "live" | "reconnecting" | "offline";

interface Options {
  onEvent(event: BoardEvent): void;
  /** Called every time the stream (re)connects — refetch the board to catch anything missed. */
  onSync(): void;
  /** Called after a connection error; use it to detect an expired session. */
  onError?(): void;
}

const MAX_BACKOFF_MS = 30_000;

/** Delay before reconnect attempt `n` (0-based): exponential, capped, with jitter. */
export function reconnectDelay(attempt: number, random: number = Math.random()): number {
  const base = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt);
  return Math.round(base * (0.5 + random / 2));
}

/**
 * Keeps one EventSource open to /api/events and reconnects with bounded backoff.
 * The board stays fully usable while disconnected; it just won't see others' changes live.
 */
export function useLiveUpdates({ onEvent, onSync, onError }: Options): LiveStatus {
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const handlers = useRef({ onEvent, onSync, onError });
  useEffect(() => {
    handlers.current = { onEvent, onSync, onError };
  });

  useEffect(() => {
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let stopped = false;

    const close = () => {
      source?.close();
      source = null;
    };

    const scheduleReconnect = () => {
      clearTimeout(retryTimer);
      if (stopped) return;
      if (!navigator.onLine) {
        setStatus("offline");
        return; // the "online" listener reconnects
      }
      setStatus("reconnecting");
      retryTimer = setTimeout(connect, reconnectDelay(attempt++));
    };

    function connect() {
      clearTimeout(retryTimer);
      close();
      if (stopped) return;
      const es = new EventSource("/api/events");
      source = es;
      es.addEventListener("ready", () => {
        attempt = 0;
        setStatus("live");
        handlers.current.onSync();
      });
      es.addEventListener("board", (msg) => {
        try {
          handlers.current.onEvent(JSON.parse((msg as MessageEvent<string>).data) as BoardEvent);
        } catch {
          // A malformed message is ignored; the next refetch reconciles.
        }
      });
      // Planned close (function time limit): reconnect right away.
      es.addEventListener("bye", () => connect());
      es.addEventListener("reset", () => {
        close();
        scheduleReconnect();
      });
      es.onerror = () => {
        if (source !== es) return;
        close();
        handlers.current.onError?.();
        scheduleReconnect();
      };
    }

    const onOnline = () => {
      attempt = 0;
      connect();
    };
    const onOffline = () => {
      close();
      clearTimeout(retryTimer);
      setStatus("offline");
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && !source) onOnline();
    };

    connect();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      close();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return status;
}
