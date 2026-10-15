import { describe, expect, it } from "vitest";
import { boardReducer, initialBoardState, shouldAccept, type BoardState } from "@/components/board/board-state";
import { reconnectDelay } from "@/components/board/use-live-updates";
import { describeEvent } from "@/lib/format";
import { resolveReaction, REACTIONS } from "@/config/reactions";
import { REACTION_CATEGORIES, type BoardEvent, type BoardSnapshot, type Member, type Task } from "@/types";

const T0 = "2026-01-01T00:00:00.000Z";
function task(id: string, version = 1, extra: Partial<Task> = {}): Task {
  return {
    id,
    key: `TASK-${id}`,
    title: `Task ${id}`,
    description: "",
    status: "todo",
    priority: "medium",
    position: 1024,
    dueDate: null,
    labels: [],
    assigneeId: null,
    createdBy: "u",
    updatedBy: "u",
    version,
    createdAt: T0,
    updatedAt: T0,
    completedAt: null,
    ...extra,
  };
}
function snapshot(tasks: Task[], serverTime = "2026-01-02T00:00:00.000Z"): BoardSnapshot {
  return { tasks, members: [], settings: { reactionVisibility: "everyone" }, serverTime };
}
function state(tasks: Task[]): BoardState {
  return initialBoardState(snapshot(tasks));
}

describe("board state reconciliation", () => {
  it("accepts newer or equal versions, and only strictly newer while a save is pending", () => {
    expect(shouldAccept(task("a", 2), task("a", 3), false)).toBe(true);
    expect(shouldAccept(task("a", 2), task("a", 2), false)).toBe(true);
    expect(shouldAccept(task("a", 2), task("a", 1), false)).toBe(false);
    expect(shouldAccept(task("a", 2), task("a", 2), true)).toBe(false);
    expect(shouldAccept(task("a", 2), task("a", 3), true)).toBe(true);
  });

  it("ignores stale live events", () => {
    const s = state([task("a", 5, { title: "new" })]);
    const next = boardReducer(s, { type: "upsert", task: task("a", 4, { title: "old" }) });
    expect(next.tasks.a.title).toBe("new");
  });

  it("does not resurrect a deleted task from a stale event or refetch", () => {
    let s = boardReducer(state([task("a")]), { type: "remove", id: "a" });
    s = boardReducer(s, { type: "upsert", task: task("a", 2) });
    expect(s.tasks.a).toBeUndefined();
    s = boardReducer(s, { type: "snapshot", snapshot: snapshot([task("a", 2)]), asOf: T0 });
    expect(s.tasks.a).toBeUndefined();
  });

  it("refetch keeps tasks that changed after the snapshot was taken, drops the rest", () => {
    let s = state([task("old"), task("gone")]);
    s = boardReducer(s, { type: "upsert", task: task("fresh", 1, { updatedAt: "2026-01-03T00:00:00.000Z" }) });
    s = boardReducer(s, { type: "snapshot", snapshot: snapshot([task("old")], "2026-01-02T00:00:00.000Z"), asOf: "2026-01-02T00:00:00.000Z" });
    expect(Object.keys(s.tasks).sort()).toEqual(["fresh", "old"]);
  });

  it("keeps an optimistic move while its save is in flight, then rolls back only if nothing newer arrived", () => {
    const original = task("a", 3, { status: "todo" });
    let s = state([original]);
    s = boardReducer(s, { type: "optimistic", task: { ...original, status: "done" } });
    s = boardReducer(s, { type: "pending", id: "a", delta: 1 });
    // A refetch with the pre-move version must not undo the optimistic move.
    s = boardReducer(s, { type: "snapshot", snapshot: snapshot([original]), asOf: T0 });
    expect(s.tasks.a.status).toBe("done");
    s = boardReducer(s, { type: "pending", id: "a", delta: -1 });
    s = boardReducer(s, { type: "rollback", original });
    expect(s.tasks.a.status).toBe("todo");

    // If a newer version arrived meanwhile, the rollback is skipped.
    let s2 = boardReducer(state([original]), { type: "optimistic", task: { ...original, status: "done" } });
    s2 = boardReducer(s2, { type: "upsert", task: task("a", 4, { status: "in_progress" }) });
    s2 = boardReducer(s2, { type: "rollback", original });
    expect(s2.tasks.a).toMatchObject({ version: 4, status: "in_progress" });
  });
});

describe("live connection backoff", () => {
  it("grows exponentially, with jitter, capped at 30s", () => {
    expect(reconnectDelay(0, 1)).toBe(1000);
    expect(reconnectDelay(0, 0)).toBe(500);
    expect(reconnectDelay(3, 1)).toBe(8000);
    expect(reconnectDelay(20, 1)).toBe(30_000);
  });
});

describe("activity descriptions", () => {
  const members = new Map<string, Member>([["b", { id: "b", username: "bob", name: "Bob", active: true }]]);
  const ev = (partial: Partial<BoardEvent>): BoardEvent => ({
    id: "e",
    type: "created",
    taskId: "t",
    taskKey: "TASK-004",
    taskTitle: "T",
    actorId: "a",
    at: T0,
    changes: {},
    reaction: null,
    task: null,
    settings: null,
    ...partial,
  });
  it("describes each event type", () => {
    expect(describeEvent(ev({}), members)).toBe("created TASK-004");
    expect(describeEvent(ev({ type: "status_changed", changes: { status: { from: "todo", to: "done" } } }), members)).toBe("moved TASK-004 to Done");
    expect(describeEvent(ev({ type: "assigned", changes: { assigneeId: { from: null, to: "b" } } }), members)).toBe("assigned TASK-004 to Bob");
    expect(describeEvent(ev({ type: "assigned", changes: { assigneeId: { from: "b", to: null } } }), members)).toBe("unassigned TASK-004");
    expect(describeEvent(ev({ type: "edited", changes: { title: { from: "a", to: "b" }, dueDate: { from: null, to: "2026-01-01" } } }), members)).toBe("edited TASK-004 title, due date");
    expect(describeEvent(ev({ type: "deleted" }), members)).toBe("deleted TASK-004");
  });
});

describe("reaction configuration", () => {
  it("has all five categories with a caption, video, poster and sound", () => {
    for (const c of REACTION_CATEGORIES) {
      expect(REACTIONS[c].caption.length, c).toBeGreaterThan(0);
      expect(REACTIONS[c].media?.kind, c).toBe("video");
      expect(REACTIONS[c].poster, c).toMatch(/^\/memes\//);
      expect(REACTIONS[c].sound, c).toMatch(/\.mp3$/);
    }
  });

  it("allows meme packs in sub-folders", () => {
    expect(resolveReaction({ caption: "x", media: "/memes/india/a.mp4" }).media?.src).toBe("/memes/india/a.mp4");
  });

  it("detects media types from the file extension", () => {
    expect(resolveReaction({ caption: "x", media: "/memes/a.webm" }).media).toEqual({ kind: "video", src: "/memes/a.webm", type: "video/webm" });
    expect(resolveReaction({ caption: "x", media: "/memes/a.gif" }).media).toEqual({ kind: "image", src: "/memes/a.gif" });
    expect(resolveReaction({ caption: "x" }).media).toBeNull();
  });

  it("refuses external or unsafe media and falls back to caption only", () => {
    for (const media of ["https://evil.example/a.mp4", "/memes/../secret.mp4", "/memes/india/../../x.mp4", "javascript:alert(1)", "/memes/a.svg", "/other/a.mp4"]) {
      const r = resolveReaction({ caption: "Plot twist.", media });
      expect(r.media, media).toBeNull();
      expect(r.caption).toBe("Plot twist.");
    }
  });
});
