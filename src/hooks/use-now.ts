"use client";

import { useSyncExternalStore } from "react";

// One shared clock for relative times ("5m ago"), ticking every 30 seconds.
let now = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const subscribers = new Set<() => void>();

function subscribe(cb: () => void) {
  subscribers.add(cb);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      subscribers.forEach((s) => s());
    }, 30_000);
  }
  return () => {
    subscribers.delete(cb);
    if (subscribers.size === 0) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

export function useNow(): number {
  return useSyncExternalStore(
    subscribe,
    () => now || Date.now(),
    () => 0,
  );
}
