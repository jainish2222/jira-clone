"use client";

import { useEffect, useState } from "react";
import { api, friendlyError } from "@/lib/api-client";
import type { BoardEvent } from "@/types";

interface Result {
  key: string;
  events: BoardEvent[];
  error: string | null;
}

/** Loads history whenever `enabled` turns on; live events are merged in by the caller. */
export function useActivity(enabled: boolean, taskId?: string) {
  const key = enabled ? (taskId ?? "*") : null;
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const query = key === "*" ? "?limit=50" : `?taskId=${key}&limit=50`;
    api<{ events: BoardEvent[] }>(`/api/activity${query}`, { retries: 1 })
      .then((res) => !cancelled && setResult({ key, events: res.events, error: null }))
      .catch((err) => !cancelled && setResult({ key, events: [], error: friendlyError(err) }));
    return () => {
      cancelled = true;
    };
  }, [key]);

  const current = result && result.key === key ? result : null;
  return { events: current?.events ?? [], loading: key !== null && current === null, error: current?.error ?? null };
}
