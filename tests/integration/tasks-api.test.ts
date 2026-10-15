import { describe, expect, it } from "vitest";
import * as tasksRoute from "@/app/api/tasks/route";
import * as taskRoute from "@/app/api/tasks/[id]/route";
import * as activityRoute from "@/app/api/activity/route";
import { getDb } from "@/lib/mongodb";
import { createUser, ctx, json, makeRequest, setupTestDatabase, type TestUser } from "./helpers";
import type { Task } from "@/types";

setupTestDatabase();

async function create(user: TestUser, body: Record<string, unknown>) {
  const res = await tasksRoute.POST(makeRequest("POST", "/api/tasks", { body, cookie: user.cookie }), ctx());
  return { res, body: await json(res) };
}

async function patch(user: TestUser, id: string, body: Record<string, unknown>) {
  const res = await taskRoute.PATCH(makeRequest("PATCH", `/api/tasks/${id}`, { body, cookie: user.cookie }), ctx({ id }));
  return { res, body: await json(res) };
}

async function list(user: TestUser, query = "") {
  const res = await tasksRoute.GET(makeRequest("GET", `/api/tasks${query}`, { cookie: user.cookie }), ctx());
  return (await json(res)).data.tasks as Task[];
}

describe("task creation and retrieval", () => {
  it("creates a task with a readable key, trimmed fields and an activity event", async () => {
    const alice = await createUser();
    const { res, body } = await create(alice, {
      title: "  Write the launch post  ",
      description: "  draft first ",
      priority: "high",
      dueDate: "2026-11-02",
      labels: ["Marketing", "marketing", " blog "],
      assigneeId: alice.member.id,
    });
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    const task: Task = body.data.task;
    expect(task).toMatchObject({
      key: "TASK-001",
      title: "Write the launch post",
      description: "draft first",
      status: "todo",
      priority: "high",
      dueDate: "2026-11-02",
      labels: ["Marketing", "blog"],
      assigneeId: alice.member.id,
      createdBy: alice.member.id,
      updatedBy: alice.member.id,
      version: 1,
      completedAt: null,
    });
    expect(body.data.event).toMatchObject({ type: "created", taskId: task.id, actorId: alice.member.id });

    const get = await taskRoute.GET(makeRequest("GET", `/api/tasks/${task.id}`, { cookie: alice.cookie }), ctx({ id: task.id }));
    expect(get.status).toBe(200);
    expect((await json(get)).data.task.title).toBe("Write the launch post");
  });

  it("issues sequential keys and puts new tasks at the top of the column", async () => {
    const alice = await createUser();
    const a = (await create(alice, { title: "A" })).body.data.task;
    const b = (await create(alice, { title: "B" })).body.data.task;
    expect([a.key, b.key]).toEqual(["TASK-001", "TASK-002"]);
    expect(b.position).toBeLessThan(a.position);
    expect((await list(alice)).map((t) => t.title)).toEqual(["B", "A"]);
  });

  it("returns the original task when the same create request is replayed", async () => {
    const alice = await createUser();
    const payload = { title: "Only once", clientRequestId: "req-1234567890" };
    const [first, second] = await Promise.all([create(alice, payload), create(alice, payload)]);
    const statuses = [first.res.status, second.res.status].sort();
    expect(statuses).toEqual([200, 201]);
    expect(first.body.data.task.id).toBe(second.body.data.task.id);
    expect(await list(alice)).toHaveLength(1);
  });

  it("rejects empty titles, oversized fields and bad enums with 422", async () => {
    const alice = await createUser();
    for (const body of [
      { title: "   " },
      { title: "x".repeat(201) },
      { title: "ok", description: "x".repeat(5001) },
      { title: "ok", status: "blocked" },
      { title: "ok", priority: "urgent" },
      { title: "ok", dueDate: "2026-02-30" },
      { title: "ok", labels: ["a", "b", "c", "d", "e", "f"] },
      { title: "ok", unexpected: true },
    ]) {
      const { res, body: out } = await create(alice, body);
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(out.error.code).toBe("VALIDATION_FAILED");
      expect(out.error.details.fields.length).toBeGreaterThan(0);
    }
  });

  it("rejects an assignee who is not a team member", async () => {
    const alice = await createUser();
    const { res } = await create(alice, { title: "ok", assigneeId: "65f000000000000000000000" });
    expect(res.status).toBe(422);
  });

  it("handles malformed JSON (400), wrong content type (415) and huge bodies (413)", async () => {
    const alice = await createUser();
    const bad = await tasksRoute.POST(
      makeRequest("POST", "/api/tasks", { rawBody: "{nope", cookie: alice.cookie, headers: { "content-type": "application/json" } }),
      ctx(),
    );
    expect(bad.status).toBe(400);
    expect((await json(bad)).error.code).toBe("INVALID_JSON");

    const text = await tasksRoute.POST(
      makeRequest("POST", "/api/tasks", { rawBody: "title=x", cookie: alice.cookie, headers: { "content-type": "text/plain" } }),
      ctx(),
    );
    expect(text.status).toBe(415);

    const huge = await create(alice, { title: "x", description: "y".repeat(40_000) });
    expect(huge.res.status).toBe(413);
  });

  it("searches and filters", async () => {
    const alice = await createUser();
    const bob = await createUser("bob", "Bob");
    await create(alice, { title: "Fix login bug", priority: "high", assigneeId: bob.member.id });
    await create(alice, { title: "Write docs", description: "explain the LOGIN flow", priority: "low" });
    await create(alice, { title: "Unrelated", priority: "high" });

    expect((await list(alice, "?q=login")).map((t) => t.title).sort()).toEqual(["Fix login bug", "Write docs"]);
    expect((await list(alice, "?priority=high")).map((t) => t.title).sort()).toEqual(["Fix login bug", "Unrelated"]);
    expect((await list(alice, `?assignee=${bob.member.id}`)).map((t) => t.title)).toEqual(["Fix login bug"]);
    expect(await list(alice, "?q=" + encodeURIComponent("(.*"))).toEqual([]); // regex characters are escaped
    const invalid = await tasksRoute.GET(makeRequest("GET", "/api/tasks?priority=urgent", { cookie: alice.cookie }), ctx());
    expect(invalid.status).toBe(422);
  });
});

describe("task updates", () => {
  it("edits fields, bumps the version and records who changed it", async () => {
    const alice = await createUser();
    const bob = await createUser("bob", "Bob");
    const task = (await create(alice, { title: "Old" })).body.data.task;

    const { res, body } = await patch(bob, task.id, { version: 1, title: "New", priority: "high", assigneeId: bob.member.id });
    expect(res.status).toBe(200);
    expect(body.data.task).toMatchObject({ title: "New", priority: "high", version: 2, updatedBy: bob.member.id, createdBy: alice.member.id });
    expect(body.data.events.map((e: { type: string }) => e.type).sort()).toEqual(["assigned", "edited"]);
  });

  it("is a no-op (no new version, no event) when nothing actually changed", async () => {
    const alice = await createUser();
    const task = (await create(alice, { title: "Same" })).body.data.task;
    const { res, body } = await patch(alice, task.id, { version: 1, title: "Same" });
    expect(res.status).toBe(200);
    expect(body.data.task.version).toBe(1);
    expect(body.data.events).toEqual([]);
  });

  it("returns 409 with the current task when the version is stale", async () => {
    const alice = await createUser();
    const bob = await createUser("bob", "Bob");
    const task = (await create(alice, { title: "Shared" })).body.data.task;
    expect((await patch(alice, task.id, { version: 1, title: "Alice's edit" })).res.status).toBe(200);

    const stale = await patch(bob, task.id, { version: 1, title: "Bob's edit" });
    expect(stale.res.status).toBe(409);
    expect(stale.body.error.code).toBe("VERSION_CONFLICT");
    expect(stale.body.error.details.task).toMatchObject({ title: "Alice's edit", version: 2 });
  });

  it("lets exactly one of two simultaneous updates win", async () => {
    const alice = await createUser();
    const bob = await createUser("bob", "Bob");
    const task = (await create(alice, { title: "Race" })).body.data.task;
    const results = await Promise.all([
      patch(alice, task.id, { version: 1, status: "in_progress" }),
      patch(bob, task.id, { version: 1, status: "done" }),
    ]);
    expect(results.map((r) => r.res.status).sort()).toEqual([200, 409]);
    const db = await getDb();
    expect(await db.collection("events").countDocuments({ type: "status_changed" })).toBe(1);
  });

  it("changes status with the right reaction, sets completedAt, and orders by placement", async () => {
    const alice = await createUser();
    const a = (await create(alice, { title: "A", status: "in_progress" })).body.data.task;
    const b = (await create(alice, { title: "B", status: "in_progress" })).body.data.task;
    // column in_progress is now [B, A]
    const c = (await create(alice, { title: "C" })).body.data.task;

    const moved = await patch(alice, c.id, { version: 1, status: "in_progress", placement: { prevId: b.id, nextId: a.id } });
    expect(moved.res.status).toBe(200);
    const status = moved.body.data.events.find((e: { type: string }) => e.type === "status_changed");
    expect(status.reaction).toBe("todo_to_in_progress");
    expect((await list(alice, "?status=in_progress")).map((t) => t.title)).toEqual(["B", "C", "A"]);

    const done = await patch(alice, c.id, { version: 2, status: "done", placement: { prevId: null, nextId: null } });
    expect(done.body.data.task.completedAt).not.toBeNull();
    expect(done.body.data.events[0].reaction).toBe("in_progress_to_done");

    const reopened = await patch(alice, c.id, { version: 3, status: "in_progress" });
    expect(reopened.body.data.task.completedAt).toBeNull();
    expect(reopened.body.data.events[0].reaction).toBe("done_to_in_progress");
  });

  it("finishing the last open task plays the special board-cleared reaction", async () => {
    const alice = await createUser();
    const a = (await create(alice, { title: "A", status: "in_progress" })).body.data.task;
    const b = (await create(alice, { title: "B" })).body.data.task;
    await create(alice, { title: "Old", status: "done" });

    const first = await patch(alice, a.id, { version: 1, status: "done" });
    expect(first.body.data.events[0].reaction).toBe("in_progress_to_done"); // B is still open

    const last = await patch(alice, b.id, { version: 1, status: "done" });
    expect(last.body.data.events[0].reaction).toBe("all_done");

    // Reopening goes back to the normal reaction.
    const reopened = await patch(alice, b.id, { version: 2, status: "in_progress" });
    expect(reopened.body.data.events[0].reaction).toBe("done_to_in_progress");
  });

  it("reorders within a column without a status-change event", async () => {
    const alice = await createUser();
    const a = (await create(alice, { title: "A" })).body.data.task;
    const b = (await create(alice, { title: "B" })).body.data.task; // [B, A]
    const { body } = await patch(alice, b.id, { version: 1, placement: { prevId: a.id, nextId: null } });
    expect(body.data.events.map((e: { type: string }) => e.type)).toEqual(["moved"]);
    expect((await list(alice)).map((t) => t.title)).toEqual(["A", "B"]);
  });

  it("keeps a consistent order when two people drop cards into the same gap", async () => {
    const alice = await createUser();
    const bob = await createUser("bob", "Bob");
    const top = (await create(alice, { title: "Top", status: "done" })).body.data.task;
    const bottom = (await create(alice, { title: "Bottom", status: "done" })).body.data.task; // [Bottom, Top]
    const x = (await create(alice, { title: "X" })).body.data.task;
    const y = (await create(alice, { title: "Y" })).body.data.task;
    const placement = { prevId: bottom.id, nextId: top.id };
    const results = await Promise.all([
      patch(alice, x.id, { version: 1, status: "done", placement }),
      patch(bob, y.id, { version: 1, status: "done", placement }),
    ]);
    expect(results.every((r) => r.res.status === 200)).toBe(true);
    const done = await list(alice, "?status=done");
    expect(done).toHaveLength(4);
    expect(done[0].title).toBe("Bottom");
    expect(done[3].title).toBe("Top");
    expect(new Set(done.map((t) => t.position)).size).toBe(4);
  });

  it("renumbers a column when positions get too close", async () => {
    const alice = await createUser();
    const a = (await create(alice, { title: "A" })).body.data.task;
    const b = (await create(alice, { title: "B" })).body.data.task; // [B, A]
    const db = await getDb();
    const { ObjectId } = await import("mongodb");
    await db.collection("tasks").updateOne({ _id: new ObjectId(a.id) }, { $set: { position: 1 } });
    await db.collection("tasks").updateOne({ _id: new ObjectId(b.id) }, { $set: { position: 1 - 1e-7 } });
    const c = (await create(alice, { title: "C", status: "done" })).body.data.task;
    const res = await patch(alice, c.id, { version: 1, status: "todo", placement: { prevId: b.id, nextId: a.id } });
    expect(res.res.status).toBe(200);
    expect((await list(alice, "?status=todo")).map((t) => t.title)).toEqual(["B", "C", "A"]);
  });

  it("rejects invalid ids (400), unknown tasks (404) and missing versions (422)", async () => {
    const alice = await createUser();
    expect((await patch(alice, "not-an-id", { version: 1, title: "x" })).res.status).toBe(400);
    expect((await patch(alice, "65f000000000000000000000", { version: 1, title: "x" })).res.status).toBe(404);
    const task = (await create(alice, { title: "T" })).body.data.task;
    expect((await patch(alice, task.id, { title: "x" })).res.status).toBe(422);
    expect((await patch(alice, task.id, { version: 1 })).res.status).toBe(422);
  });
});

describe("task deletion", () => {
  it("deletes once (204) and then reports 404", async () => {
    const alice = await createUser();
    const task = (await create(alice, { title: "Bye" })).body.data.task;
    const del = () =>
      taskRoute.DELETE(makeRequest("DELETE", `/api/tasks/${task.id}?version=1`, { cookie: alice.cookie }), ctx({ id: task.id }));
    expect((await del()).status).toBe(204);
    const again = await del();
    expect(again.status).toBe(404);
    expect((await json(again)).error.code).toBe("TASK_NOT_FOUND");
  });

  it("refuses to delete a task that changed since the client saw it", async () => {
    const alice = await createUser();
    const task = (await create(alice, { title: "Bye" })).body.data.task;
    await patch(alice, task.id, { version: 1, title: "Changed" });
    const res = await taskRoute.DELETE(
      makeRequest("DELETE", `/api/tasks/${task.id}?version=1`, { cookie: alice.cookie }),
      ctx({ id: task.id }),
    );
    expect(res.status).toBe(409);
  });
});

describe("activity history", () => {
  it("lists created, edited, assigned, status and deleted events, newest first, without moves", async () => {
    const alice = await createUser();
    const a = (await create(alice, { title: "A" })).body.data.task;
    const b = (await create(alice, { title: "B" })).body.data.task;
    await patch(alice, a.id, { version: 1, title: "A2" });
    await patch(alice, a.id, { version: 2, assigneeId: alice.member.id });
    await patch(alice, a.id, { version: 3, status: "in_progress" });
    await patch(alice, b.id, { version: 1, placement: { prevId: a.id, nextId: null } }); // move only
    await taskRoute.DELETE(makeRequest("DELETE", `/api/tasks/${b.id}`, { cookie: alice.cookie }), ctx({ id: b.id }));

    const res = await activityRoute.GET(makeRequest("GET", "/api/activity", { cookie: alice.cookie }), ctx());
    const types = (await json(res)).data.events.map((e: { type: string }) => e.type);
    expect(types).toEqual(["deleted", "status_changed", "assigned", "edited", "created", "created"]);

    const forA = await activityRoute.GET(makeRequest("GET", `/api/activity?taskId=${a.id}`, { cookie: alice.cookie }), ctx());
    expect((await json(forA)).data.events).toHaveLength(4);
  });
});
