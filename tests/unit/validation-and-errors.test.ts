import { describe, expect, it } from "vitest";
import { AppError, ERROR_DEFINITIONS } from "@/lib/errors/app-error";
import { errorResponse, parseWith, validationError } from "@/lib/api/respond";
import { createTaskSchema, updateTaskSchema, listTasksQuerySchema } from "@/lib/validations/task";
import { changePasswordSchema, loginSchema } from "@/lib/validations/auth";
import { MongoServerSelectionError } from "mongodb";

describe("task input validation", () => {
  it("trims strings and applies defaults", () => {
    const v = createTaskSchema.parse({ title: "  Ship it  ", description: "  notes " });
    expect(v).toEqual({
      title: "Ship it",
      description: "notes",
      status: "todo",
      priority: "medium",
      dueDate: null,
      labels: [],
      assigneeId: null,
    });
  });

  it("treats an empty due date as none and de-duplicates labels", () => {
    const v = createTaskSchema.parse({ title: "x", dueDate: "", labels: ["UI", " ui ", "API"] });
    expect(v.dueDate).toBeNull();
    expect(v.labels).toEqual(["UI", "API"]);
  });

  it.each([
    [{ title: "" }, "title"],
    [{ title: "   " }, "title"],
    [{ title: "a".repeat(201) }, "title"],
    [{ title: "ok", description: "a".repeat(5001) }, "description"],
    [{ title: "ok", status: "blocked" }, "status"],
    [{ title: "ok", priority: "p0" }, "priority"],
    [{ title: "ok", dueDate: "tomorrow" }, "dueDate"],
    [{ title: "ok", labels: ["a".repeat(25)] }, "labels.0"],
    [{ title: "ok", assigneeId: "not-an-id" }, "assigneeId"],
    [{ title: "ok", extra: 1 }, ""],
  ])("rejects %j (path %s)", (input, path) => {
    const r = createTaskSchema.safeParse(input);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.map((i) => i.path.join("."))).toContain(path);
  });

  it("requires a version and at least one change for updates", () => {
    expect(updateTaskSchema.safeParse({ title: "x" }).success).toBe(false);
    expect(updateTaskSchema.safeParse({ version: 1 }).success).toBe(false);
    expect(updateTaskSchema.safeParse({ version: 0, title: "x" }).success).toBe(false);
    expect(updateTaskSchema.safeParse({ version: 3, placement: { prevId: null, nextId: null } }).success).toBe(true);
    expect(updateTaskSchema.safeParse({ version: 3, assigneeId: null }).success).toBe(true);
  });

  it("validates list filters", () => {
    expect(listTasksQuerySchema.safeParse({ assignee: "unassigned" }).success).toBe(true);
    expect(listTasksQuerySchema.safeParse({ q: "a".repeat(101) }).success).toBe(false);
  });
});

describe("auth input validation", () => {
  it("normalizes usernames for login", () => {
    expect(loginSchema.parse({ username: "  Alice ", password: "x" }).username).toBe("alice");
  });

  it("enforces password rules", () => {
    expect(changePasswordSchema.safeParse({ currentPassword: "old-password-1", newPassword: "short" }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ currentPassword: "same-password-1", newPassword: "same-password-1" }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ currentPassword: "old-password-1", newPassword: "new-password-12" }).success).toBe(true);
  });
});

describe("error responses", () => {
  it("uses the standard envelope and status for app errors", async () => {
    const res = errorResponse(new AppError("TASK_NOT_FOUND"), "req-1");
    expect(res.status).toBe(404);
    expect(res.headers.get("x-request-id")).toBe("req-1");
    expect(await res.json()).toEqual({
      success: false,
      error: { code: "TASK_NOT_FOUND", message: ERROR_DEFINITIONS.TASK_NOT_FOUND.message },
    });
  });

  it("maps validation failures to 422 with field details", async () => {
    let caught: unknown;
    try {
      parseWith(createTaskSchema, { title: "" });
    } catch (e) {
      caught = e;
    }
    const res = errorResponse(caught, "req-2");
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(body.error.details.fields[0]).toMatchObject({ path: "title" });
    expect(validationError).toBeTypeOf("function");
  });

  it("hides internal errors behind a generic 500", async () => {
    const res = errorResponse(new Error("secret mongodb://user:pass@host stack"), "req-3");
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain("secret");
    expect(text).not.toContain("pass@");
    expect(JSON.parse(text).error.code).toBe("INTERNAL_ERROR");
  });

  it("turns database connectivity errors into a retryable 503", async () => {
    const err = new MongoServerSelectionError("connect ECONNREFUSED 10.0.0.5:27017", {} as never);
    const res = errorResponse(err, "req-4");
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("5");
    expect((await res.json()).error.code).toBe("DATABASE_UNAVAILABLE");
  });
});
