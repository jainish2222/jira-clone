import "server-only";
import type { ClientSession } from "mongodb";
import { getCollections, getMongoClient, type Collections } from "@/lib/mongodb";

/**
 * Runs `fn` in a MongoDB transaction so a task change and its activity event are
 * saved together or not at all. The driver retries transient conflicts, so `fn`
 * must not have side effects outside the database.
 */
export async function inTransaction<T>(fn: (session: ClientSession, c: Collections) => Promise<T>): Promise<T> {
  const collections = await getCollections();
  const client = await getMongoClient();
  const session = client.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(
      async () => {
        result = await fn(session, collections);
      },
      {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
        maxCommitTimeMS: 10_000,
      },
    );
    return result as T;
  } finally {
    await session.endSession();
  }
}
