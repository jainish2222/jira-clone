import { authedRoute } from "@/lib/api/respond";
import { getEnv } from "@/lib/env";
import { getCollections } from "@/lib/mongodb";
import { eventHub } from "@/services/event-hub";

export const runtime = "nodejs";
// Vercel ends functions at maxDuration; the stream closes itself a little earlier
// (SSE_MAX_STREAM_MS) and the browser reconnects and refetches.
export const maxDuration = 300;

const HEARTBEAT_MS = 20_000;

/**
 * Server-Sent Events stream of board changes.
 *   event: ready  -> the stream is live; the client refetches the board now
 *   event: board  -> a BoardEvent (id = event id, used to drop duplicates)
 *   event: bye    -> planned close; the client reconnects
 *   event: reset  -> the server lost its change stream; reconnect and refetch
 */
export const GET = authedRoute(async ({ req }) => {
  const env = getEnv();
  await getCollections(); // fail with a proper 503 before starting the stream if the DB is down

  const encoder = new TextEncoder();
  let closed = false;
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };

      let unsubscribe = () => {};
      const timers: { heartbeat?: ReturnType<typeof setInterval>; lifetime?: ReturnType<typeof setTimeout> } = {};

      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(timers.heartbeat);
        clearTimeout(timers.lifetime);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed by the runtime
        }
      };

      req.signal.addEventListener("abort", () => cleanup(), { once: true });
      send("retry: 3000\n\n");

      try {
        unsubscribe = await eventHub.subscribe({
          onEvent: (event) => send(`id: ${event.id}\nevent: board\ndata: ${JSON.stringify(event)}\n\n`),
          onError: () => {
            send("event: reset\ndata: {}\n\n");
            cleanup();
          },
        });
      } catch {
        send("event: reset\ndata: {}\n\n");
        cleanup();
        return;
      }
      if (closed) {
        unsubscribe();
        return;
      }

      send(`event: ready\ndata: ${JSON.stringify({ serverTime: new Date().toISOString() })}\n\n`);
      timers.heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);
      timers.lifetime = setTimeout(() => {
        send("event: bye\ndata: {}\n\n");
        cleanup();
      }, env.SSE_MAX_STREAM_MS);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});
