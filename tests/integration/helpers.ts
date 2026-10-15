import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, inject } from "vitest";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth/session";
import { resetEnvCache } from "@/lib/env";
import { getDb, resetMongoForTests } from "@/lib/mongodb";
import { loginLimiter, writeLimiter } from "@/lib/rate-limit";
import { createMember } from "@/services/members";
import type { Member } from "@/types";

export const TEST_SECRET = "test-secret-that-is-long-enough-123456";
export const TEST_PASSWORD = "correct-horse-battery";

/** Points the app at a fresh database for this test file and wipes it between tests. */
export function setupTestDatabase() {
  const dbName = `tasklol_test_${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    process.env.MONGODB_URI = inject("mongoUri");
    process.env.MONGODB_DB = dbName;
    process.env.SESSION_SECRET = TEST_SECRET;
    process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS = "5000";
    resetEnvCache();
    await resetMongoForTests();
  });

  beforeEach(async () => {
    const db = await getDb();
    await Promise.all(
      ["tasks", "members", "events", "counters", "settings"].map((n) => db.collection(n).deleteMany({})),
    );
    loginLimiter.reset();
    writeLimiter.reset();
  });

  afterAll(async () => {
    const db = await getDb();
    await db.dropDatabase();
    await resetMongoForTests();
  });
}

export interface TestUser {
  member: Member;
  cookie: string;
}

export async function createUser(username = "alice", name = "Alice Example"): Promise<TestUser> {
  const member = await createMember({ username, name, password: TEST_PASSWORD });
  const token = createSessionToken(member.id, 1, TEST_SECRET);
  return { member, cookie: `${SESSION_COOKIE}=${token}` };
}

interface RequestOptions {
  body?: unknown;
  rawBody?: string;
  cookie?: string;
  headers?: Record<string, string>;
}

export function makeRequest(method: string, path: string, opts: RequestOptions = {}): Request {
  const headers = new Headers(opts.headers);
  if (opts.cookie) headers.set("cookie", opts.cookie);
  let body: string | undefined;
  if (opts.rawBody !== undefined) body = opts.rawBody;
  else if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  }
  return new Request(`http://localhost:3000${path}`, { method, headers, body });
}

export function ctx<P extends Record<string, string>>(params: P = {} as P) {
  return { params: Promise.resolve(params) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tests inspect loosely-typed JSON bodies
export async function json<T = any>(res: Response): Promise<T> {
  return (await res.json()) as T;
}
