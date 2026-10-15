import "server-only";
import {
  MongoClient,
  MongoServerError,
  type Collection,
  type Db,
  type ObjectId,
} from "mongodb";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors/app-error";
import { logger } from "@/lib/logger";
import type {
  BoardEventType,
  FieldChange,
  ReactionCategory,
  ReactionVisibility,
  TaskPriority,
  TaskStatus,
} from "@/types";

// ---------------------------------------------------------------------------
// Document shapes (what is stored in MongoDB)
// ---------------------------------------------------------------------------

export interface TaskDoc {
  _id: ObjectId;
  key: string;
  seq: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  position: number;
  dueDate: string | null;
  labels: string[];
  assigneeId: ObjectId | null;
  createdBy: ObjectId;
  updatedBy: ObjectId;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  clientRequestId?: string;
}

export interface MemberDoc {
  _id: ObjectId;
  username: string;
  name: string;
  passwordHash: string;
  sessionVersion: number;
  active: boolean;
  failedLogins: number;
  lockedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EventDoc {
  _id: ObjectId;
  eventId: string;
  type: BoardEventType;
  taskId: ObjectId | null;
  taskKey: string | null;
  taskTitle: string | null;
  actorId: ObjectId;
  at: Date;
  changes: Record<string, FieldChange>;
  reaction: ReactionCategory | null;
  task: TaskDoc | null;
  settings: { reactionVisibility: ReactionVisibility } | null;
}

export interface CounterDoc {
  _id: string;
  seq: number;
}

export interface SettingsDoc {
  _id: "board";
  reactionVisibility: ReactionVisibility;
  updatedAt: Date;
  updatedBy: ObjectId | null;
}

export interface Collections {
  tasks: Collection<TaskDoc>;
  members: Collection<MemberDoc>;
  events: Collection<EventDoc>;
  counters: Collection<CounterDoc>;
  settings: Collection<SettingsDoc>;
}

// ---------------------------------------------------------------------------
// Connection (one client per server process, reused across requests)
// ---------------------------------------------------------------------------

interface MongoCache {
  client: MongoClient | null;
  connecting: Promise<MongoClient> | null;
  indexes: Promise<void> | null;
}

const globalForMongo = globalThis as unknown as { __tasklolMongo?: MongoCache };
const cache: MongoCache =
  globalForMongo.__tasklolMongo ?? (globalForMongo.__tasklolMongo = { client: null, connecting: null, indexes: null });

async function connect(): Promise<MongoClient> {
  const env = getEnv();
  const client = new MongoClient(env.MONGODB_URI, {
    appName: "tasklol",
    maxPoolSize: env.MONGODB_MAX_POOL_SIZE,
    minPoolSize: 0,
    maxIdleTimeMS: 60_000,
    serverSelectionTimeoutMS: env.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
    connectTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
    retryWrites: true,
    retryReads: true,
  });
  await client.connect();
  logger.info("MongoDB connected");
  return client;
}

export async function getMongoClient(): Promise<MongoClient> {
  if (cache.client) return cache.client;
  if (!cache.connecting) {
    cache.connecting = connect()
      .then((client) => {
        cache.client = client;
        return client;
      })
      .catch((err) => {
        // Let the next request try again instead of caching the failure forever.
        cache.connecting = null;
        throw err;
      });
  }
  return cache.connecting;
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  const db = client.db(getEnv().MONGODB_DB);
  if (!cache.indexes) {
    cache.indexes = ensureIndexes(db).catch((err) => {
      cache.indexes = null;
      throw err;
    });
  }
  await cache.indexes;
  return db;
}

export async function getCollections(): Promise<Collections> {
  const db = await getDb();
  return collectionsFor(db);
}

export function collectionsFor(db: Db): Collections {
  return {
    tasks: db.collection<TaskDoc>("tasks"),
    members: db.collection<MemberDoc>("members"),
    events: db.collection<EventDoc>("events"),
    counters: db.collection<CounterDoc>("counters"),
    settings: db.collection<SettingsDoc>("settings"),
  };
}

/** Idempotent; safe to run on every cold start and from `npm run db:setup`. */
export async function ensureIndexes(db: Db): Promise<void> {
  const c = collectionsFor(db);
  // Collections must exist before they are used inside transactions.
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((x) => x.name));
  for (const name of ["tasks", "members", "events", "counters", "settings"]) {
    if (!existing.has(name)) {
      try {
        await db.createCollection(name);
      } catch (err) {
        if (!(err instanceof MongoServerError && err.code === 48)) throw err; // 48 = already exists
      }
    }
  }
  await Promise.all([
    c.tasks.createIndexes([
      { key: { key: 1 }, name: "key_unique", unique: true },
      { key: { status: 1, position: 1 }, name: "status_position" },
      { key: { assigneeId: 1, status: 1 }, name: "assignee_status" },
      { key: { updatedAt: -1 }, name: "updatedAt_desc" },
      {
        key: { clientRequestId: 1 },
        name: "clientRequestId_unique",
        unique: true,
        partialFilterExpression: { clientRequestId: { $type: "string" } },
      },
    ]),
    c.members.createIndexes([{ key: { username: 1 }, name: "username_unique", unique: true }]),
    c.events.createIndexes([
      { key: { eventId: 1 }, name: "eventId_unique", unique: true },
      { key: { at: -1 }, name: "at_desc" },
      { key: { taskId: 1, at: -1 }, name: "task_at" },
    ]),
  ]);
}

/** Test helper: close and forget the shared client. */
export async function resetMongoForTests(): Promise<void> {
  const client = cache.client;
  cache.client = null;
  cache.connecting = null;
  cache.indexes = null;
  await client?.close(true).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

const UNAVAILABLE_ERROR_NAMES = new Set([
  "MongoServerSelectionError",
  "MongoNetworkError",
  "MongoNetworkTimeoutError",
  "MongoTopologyClosedError",
  "MongoNotConnectedError",
  "MongoOperationTimeoutError",
  "MongoPoolClearedError",
]);

/** Converts driver connectivity/timeouts into a 503; returns null for anything else. */
export function toDatabaseUnavailable(err: unknown): AppError | null {
  if (!(err instanceof Error)) return null;
  if (UNAVAILABLE_ERROR_NAMES.has(err.name)) return new AppError("DATABASE_UNAVAILABLE", { cause: err });
  if (err instanceof MongoServerError && (err.code === 50 /* MaxTimeMSExpired */ || err.code === 91 /* ShutdownInProgress */)) {
    return new AppError("DATABASE_UNAVAILABLE", { cause: err });
  }
  return null;
}

/** Default per-query time limit so a slow database fails fast instead of hanging requests. */
export const QUERY_MAX_TIME_MS = 8_000;
