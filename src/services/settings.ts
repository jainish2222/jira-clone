import "server-only";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { getCollections, QUERY_MAX_TIME_MS } from "@/lib/mongodb";
import type { UpdateSettingsInput } from "@/lib/validations/settings";
import { toBoardEvent } from "@/services/serializers";
import { inTransaction } from "@/services/transaction";
import type { BoardEvent, BoardSettings } from "@/types";

export const DEFAULT_SETTINGS: BoardSettings = { reactionVisibility: "everyone" };

export async function getSettings(): Promise<BoardSettings> {
  const { settings } = await getCollections();
  const doc = await settings.findOne({ _id: "board" }, { maxTimeMS: QUERY_MAX_TIME_MS });
  return doc ? { reactionVisibility: doc.reactionVisibility } : DEFAULT_SETTINGS;
}

export async function updateSettings(
  input: UpdateSettingsInput,
  actorId: string,
): Promise<{ settings: BoardSettings; event: BoardEvent }> {
  const actor = new ObjectId(actorId);
  return inTransaction(async (session, c) => {
    const now = new Date();
    await c.settings.updateOne(
      { _id: "board" },
      { $set: { reactionVisibility: input.reactionVisibility, updatedAt: now, updatedBy: actor } },
      { upsert: true, session },
    );
    const settings: BoardSettings = { reactionVisibility: input.reactionVisibility };
    const event = {
      _id: new ObjectId(),
      eventId: randomUUID(),
      type: "settings_changed" as const,
      taskId: null,
      taskKey: null,
      taskTitle: null,
      actorId: actor,
      at: now,
      changes: {},
      reaction: null,
      task: null,
      settings,
    };
    await c.events.insertOne(event, { session });
    return { settings, event: toBoardEvent(event) };
  });
}
