import "server-only";
import { ObjectId, type Filter } from "mongodb";
import { getCollections, QUERY_MAX_TIME_MS, type EventDoc } from "@/lib/mongodb";
import { toBoardEvent } from "@/services/serializers";
import { HISTORY_EVENT_TYPES, type BoardEvent } from "@/types";

export async function listActivity(options: { taskId?: string; limit?: number } = {}): Promise<BoardEvent[]> {
  const { events } = await getCollections();
  const filter: Filter<EventDoc> = { type: { $in: HISTORY_EVENT_TYPES } };
  if (options.taskId) filter.taskId = new ObjectId(options.taskId);
  const docs = await events
    // History lists don't need the task snapshot.
    .find(filter, { maxTimeMS: QUERY_MAX_TIME_MS, projection: { task: 0 } })
    .sort({ at: -1, _id: -1 })
    .limit(Math.min(Math.max(options.limit ?? 50, 1), 100))
    .toArray();
  return docs.map((d) => toBoardEvent({ ...d, task: null }));
}
