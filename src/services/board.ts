import "server-only";
import { listMembers } from "@/services/members";
import { getSettings } from "@/services/settings";
import { listTasks } from "@/services/tasks";
import type { BoardSnapshot } from "@/types";

/** Everything the board needs in one round trip (three parallel queries, no N+1). */
export async function getBoardSnapshot(): Promise<BoardSnapshot> {
  // Taken *before* querying: anything the client saw change after this moment is newer than the snapshot.
  const serverTime = new Date().toISOString();
  const [tasks, members, settings] = await Promise.all([listTasks(), listMembers(), getSettings()]);
  return { tasks, members, settings, serverTime };
}
