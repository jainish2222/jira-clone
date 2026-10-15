import { describe, expect, it } from "vitest";
import * as eventsRoute from "@/app/api/events/route";
import * as healthRoute from "@/app/api/health/route";
import * as tasksRoute from "@/app/api/tasks/route";
import { resetEnvCache } from "@/lib/env";
import { resetMongoForTests } from "@/lib/mongodb";
import { eventHub } from "@/services/event-hub";
import { createUser, ctx, json, makeRequest, setupTestDatabase } from "./helpers";

setupTestDatabase();

/** Reads SSE frames from a streaming Response until `predicate` matches or time runs out. */
async function readFrames(res: Response, predicate: (frames: string[]) => boolean, timeoutMs = 10_000) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const frames: string[] = [];
  const deadline = Date.now() + timeoutMs;
  // Keep one outstanding read; a timed-out race must not drop the chunk it eventually returns.
  let pending: Promise<ReadableStreamReadResult<Uint8Array>> | null = null;
  while (Date.now() < deadline && !predicate(frames)) {
    pending ??= reader.read();
    const result = await Promise.race([pending, new Promise<null>((r) => setTimeout(() => r(null), 250))]);
    if (!result) continue;
    pending = null;
    if (result.done) break;
    buffer += decoder.decode(result.value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop()!;
    frames.push(...parts);
  }
  await reader.cancel().catch(() => undefined);
  return frames;
}

describe("real-time event stream", () => {
  it("streams a ready event, then other members' changes with event ids", async () => {
    const alice = await createUser();
    const bob = await createUser("bob", "Bob");
    const controller = new AbortController();
    const req = new Request("http://localhost:3000/api/events", {
      headers: { cookie: bob.cookie },
      signal: controller.signal,
    });
    const res = await eventsRoute.GET(req, ctx());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const created = (async () => {
      // Give the stream a moment to send "ready" before writing.
      await new Promise((r) => setTimeout(r, 300));
      return tasksRoute.POST(makeRequest("POST", "/api/tasks", { body: { title: "Live!" }, cookie: alice.cookie }), ctx());
    })();

    const frames = await readFrames(res, (f) => f.some((x) => x.includes("event: board")));
    controller.abort();
    await created;

    expect(frames.some((f) => f.includes("event: ready"))).toBe(true);
    const board = frames.find((f) => f.includes("event: board"))!;
    const id = /^id: (.+)$/m.exec(board)![1];
    const data = JSON.parse(/^data: (.+)$/m.exec(board)![1]);
    expect(data).toMatchObject({ id, type: "created", taskTitle: "Live!", actorId: alice.member.id });
    expect(data.task.title).toBe("Live!");
  });

  it("requires a session", async () => {
    const res = await eventsRoute.GET(new Request("http://localhost:3000/api/events"), ctx());
    expect(res.status).toBe(401);
    expect(eventHub.size).toBe(0);
  });
});

describe("database outages", () => {
  it("answers 503 with a friendly message (no internals) when MongoDB is unreachable", async () => {
    const alice = await createUser();
    const realUri = process.env.MONGODB_URI;
    try {
      process.env.MONGODB_URI = "mongodb://127.0.0.1:1/?directConnection=true";
      process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS = "300";
      resetEnvCache();
      await resetMongoForTests();

      const res = await tasksRoute.GET(makeRequest("GET", "/api/tasks", { cookie: alice.cookie }), ctx());
      expect(res.status).toBe(503);
      const body = await json(res);
      expect(body).toEqual({
        success: false,
        error: { code: "DATABASE_UNAVAILABLE", message: "The database is temporarily unavailable. Please try again." },
      });
      expect(JSON.stringify(body)).not.toContain("127.0.0.1");

      const health = await healthRoute.GET();
      expect(health.status).toBe(503);
      expect(await json(health)).toEqual({ status: "degraded", database: "unavailable" });
    } finally {
      process.env.MONGODB_URI = realUri;
      process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS = "5000";
      resetEnvCache();
      await resetMongoForTests();
    }
    // Recovers on the next request once the database is back.
    const ok = await tasksRoute.GET(makeRequest("GET", "/api/tasks", { cookie: alice.cookie }), ctx());
    expect(ok.status).toBe(200);
  });

  it("answers 503 SERVICE_NOT_CONFIGURED when env vars are missing", async () => {
    const realSecret = process.env.SESSION_SECRET;
    try {
      delete process.env.SESSION_SECRET;
      resetEnvCache();
      const res = await tasksRoute.GET(makeRequest("GET", "/api/tasks"), ctx());
      expect(res.status).toBe(503);
      expect((await json(res)).error.code).toBe("SERVICE_NOT_CONFIGURED");
    } finally {
      process.env.SESSION_SECRET = realSecret;
      resetEnvCache();
    }
  });

  it("reports healthy when the database is reachable", async () => {
    const res = await healthRoute.GET();
    expect(res.status).toBe(200);
    expect((await json(res)).status).toBe("ok");
  });
});
