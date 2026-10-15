"use client";

import { useCallback, useSyncExternalStore } from "react";

function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

// --- Tiny localStorage-backed preference (per device, never shared) ---------

const listeners = new Set<() => void>();

function readPref(key: string, fallback: boolean): boolean {
  try {
    const v = window.localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}

export function useDevicePreference(key: string, fallback: boolean): [boolean, (v: boolean) => void] {
  const value = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      window.addEventListener("storage", cb);
      return () => {
        listeners.delete(cb);
        window.removeEventListener("storage", cb);
      };
    },
    () => readPref(key, fallback),
    () => fallback,
  );
  const set = useCallback(
    (v: boolean) => {
      try {
        window.localStorage.setItem(key, v ? "1" : "0");
      } catch {
        // storage unavailable (private mode): the toggle just won't persist
      }
      listeners.forEach((l) => l());
    },
    [key],
  );
  return [value, set];
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}
