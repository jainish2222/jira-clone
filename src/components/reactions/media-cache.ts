"use client";

/**
 * Downloads every meme file once, in the background, and keeps it in memory as a
 * blob URL. When a reaction fires, its video and sound start instantly instead of
 * waiting for the network. Files that haven't finished loading fall back to their
 * normal URL, so nothing breaks if preloading is slow or skipped.
 */
const cache = new Map<string, string>();
let started = false;

export function cachedUrl(url: string): string;
export function cachedUrl(url: string | null): string | null;
export function cachedUrl(url: string | null): string | null {
  return url ? (cache.get(url) ?? url) : null;
}

export function preloadMedia(urls: string[], concurrency = 3): void {
  if (started || typeof window === "undefined" || typeof fetch !== "function") return;
  started = true;
  // Respect "data saver": skip preloading, reactions still work (just load on demand).
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return;

  const queue = [...urls];
  const worker = async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      try {
        const res = await fetch(url, { cache: "force-cache" });
        if (!res.ok) continue;
        cache.set(url, URL.createObjectURL(await res.blob()));
      } catch {
        // Offline or blocked: this file will simply load on demand.
      }
    }
  };
  for (let i = 0; i < concurrency; i++) void worker();
}

/** Test helper. */
export function resetMediaCache() {
  for (const blobUrl of cache.values()) URL.revokeObjectURL?.(blobUrl);
  cache.clear();
  started = false;
}
