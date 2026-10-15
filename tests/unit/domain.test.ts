import { describe, expect, it } from "vitest";
import { getReactionCategory } from "@/lib/tasks/transitions";
import { formatTaskKey } from "@/lib/tasks/task-key";
import { formatDueDate, isDueToday, isOverdue, isValidDateOnly, todayDateOnly } from "@/lib/tasks/due-date";
import { compareByPosition, positionBetween, renumberedPositions, POSITION_STEP } from "@/lib/tasks/position";
import { groupByStatus, isFiltering, matchesFilters, summarize } from "@/lib/tasks/filter";
import type { Task } from "@/types";

function task(partial: Partial<Task>): Task {
  return {
    id: "a".repeat(24),
    key: "TASK-001",
    title: "Task",
    description: "",
    status: "todo",
    priority: "medium",
    position: 1024,
    dueDate: null,
    labels: [],
    assigneeId: null,
    createdBy: "b".repeat(24),
    updatedBy: "b".repeat(24),
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    completedAt: null,
    ...partial,
  };
}

describe("status transition → reaction category", () => {
  it.each([
    ["todo", "in_progress", "todo_to_in_progress"],
    ["in_progress", "done", "in_progress_to_done"],
    ["done", "in_progress", "done_to_in_progress"],
    ["in_progress", "todo", "in_progress_to_todo"],
    ["todo", "done", "other_transition"],
    ["done", "todo", "other_transition"],
  ] as const)("%s → %s is %s", (from, to, expected) => {
    expect(getReactionCategory(from, to)).toBe(expected);
  });

  it("returns null when the status doesn't change (reordering)", () => {
    expect(getReactionCategory("todo", "todo")).toBeNull();
    expect(getReactionCategory("done", "done")).toBeNull();
  });
});

describe("task keys", () => {
  it("pads to three digits and grows beyond", () => {
    expect(formatTaskKey(1)).toBe("TASK-001");
    expect(formatTaskKey(42)).toBe("TASK-042");
    expect(formatTaskKey(999)).toBe("TASK-999");
    expect(formatTaskKey(1234)).toBe("TASK-1234");
  });

  it("rejects invalid sequences", () => {
    expect(() => formatTaskKey(0)).toThrow(RangeError);
    expect(() => formatTaskKey(1.5)).toThrow(RangeError);
    expect(() => formatTaskKey(-3)).toThrow(RangeError);
  });
});

describe("due dates", () => {
  it("validates real calendar dates only", () => {
    expect(isValidDateOnly("2026-02-28")).toBe(true);
    expect(isValidDateOnly("2028-02-29")).toBe(true); // leap year
    expect(isValidDateOnly("2026-02-29")).toBe(false);
    expect(isValidDateOnly("2026-13-01")).toBe(false);
    expect(isValidDateOnly("2026-1-1")).toBe(false);
    expect(isValidDateOnly("2026-01-01T00:00:00Z")).toBe(false);
    expect(isValidDateOnly("1969-12-31")).toBe(false);
  });

  it("is overdue only before today and only when not done", () => {
    expect(isOverdue("2026-03-09", false, "2026-03-10")).toBe(true);
    expect(isOverdue("2026-03-10", false, "2026-03-10")).toBe(false);
    expect(isOverdue("2026-03-09", true, "2026-03-10")).toBe(false);
    expect(isOverdue(null, false, "2026-03-10")).toBe(false);
    expect(isDueToday("2026-03-10", "2026-03-10")).toBe(true);
  });

  it("computes 'today' per time zone, so the same instant can be different days", () => {
    const instant = new Date("2026-03-10T02:30:00Z");
    expect(todayDateOnly(instant, "UTC")).toBe("2026-03-10");
    expect(todayDateOnly(instant, "America/Los_Angeles")).toBe("2026-03-09");
    expect(todayDateOnly(instant, "Asia/Kolkata")).toBe("2026-03-10");
    expect(todayDateOnly(instant, "Pacific/Kiritimati")).toBe("2026-03-10");
  });

  it("formats a due date without shifting the day", () => {
    expect(formatDueDate("2026-03-01", "2026-02-20")).toBe("Mar 1");
    expect(formatDueDate("2027-01-05", "2026-12-20")).toBe("Jan 5, 2027");
  });
});

describe("ordering positions", () => {
  it("places items between, before and after neighbours", () => {
    expect(positionBetween(null, null)).toBe(POSITION_STEP);
    expect(positionBetween(1024, null)).toBe(2048);
    expect(positionBetween(null, 1024)).toBe(0);
    expect(positionBetween(1024, 2048)).toBe(1536);
  });

  it("asks for a renumber when the gap is exhausted", () => {
    expect(positionBetween(1, 1 + 1e-9)).toBeNull();
    expect(positionBetween(5, 5)).toBeNull();
    expect(renumberedPositions(3)).toEqual([1024, 2048, 3072]);
  });

  it("breaks ties by id, like the server sort", () => {
    const a = { position: 1, id: "a" };
    const b = { position: 1, id: "b" };
    expect([b, a].sort(compareByPosition)).toEqual([a, b]);
  });
});

describe("board filtering", () => {
  const me = "m".repeat(24);
  const tasks = [
    task({ id: "1".repeat(24), title: "Fix login bug", priority: "high", assigneeId: me, position: 2 }),
    task({ id: "2".repeat(24), title: "Docs", description: "Explain LOGIN", priority: "low", position: 1 }),
    task({ id: "3".repeat(24), key: "TASK-077", title: "Other", status: "done", labels: ["Infra"] }),
  ];
  const base = { search: "", priority: "all" as const, assignee: "all", meId: me };

  it("matches title, description, key and labels case-insensitively", () => {
    expect(tasks.filter((t) => matchesFilters(t, { ...base, search: "login" }))).toHaveLength(2);
    expect(tasks.filter((t) => matchesFilters(t, { ...base, search: "task-077" }))).toHaveLength(1);
    expect(tasks.filter((t) => matchesFilters(t, { ...base, search: "infra" }))).toHaveLength(1);
  });

  it("filters by priority and assignee", () => {
    expect(tasks.filter((t) => matchesFilters(t, { ...base, priority: "high" }))).toHaveLength(1);
    expect(tasks.filter((t) => matchesFilters(t, { ...base, assignee: "me" }))).toHaveLength(1);
    expect(tasks.filter((t) => matchesFilters(t, { ...base, assignee: "unassigned" }))).toHaveLength(2);
    expect(isFiltering(base)).toBe(false);
    expect(isFiltering({ ...base, search: "  " })).toBe(false);
    expect(isFiltering({ ...base, priority: "low" })).toBe(true);
  });

  it("groups by status in position order and summarizes", () => {
    const g = groupByStatus(tasks);
    expect(g.todo.map((t) => t.title)).toEqual(["Docs", "Fix login bug"]);
    expect(g.done).toHaveLength(1);
    expect(summarize([...tasks, task({ dueDate: "2020-01-01" })], "2026-01-01")).toEqual({ total: 4, done: 1, overdue: 1 });
  });
});
