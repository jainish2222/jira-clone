import type { BoardSettings, BoardSnapshot, Member, Task } from "@/types";

/**
 * Client-side board state. The server is the source of truth; these rules decide
 * how optimistic changes, live events and refetches are merged without letting
 * old data overwrite newer data.
 */
export interface BoardState {
  tasks: Record<string, Task>;
  /** Number of in-flight mutations per task id. */
  pending: Record<string, number>;
  /** Ids deleted while this page was open, so a stale refetch can't bring them back. */
  deleted: Record<string, true>;
  members: Member[];
  settings: BoardSettings;
}

export type BoardAction =
  | { type: "snapshot"; snapshot: BoardSnapshot; asOf: string }
  | { type: "upsert"; task: Task }
  | { type: "optimistic"; task: Task }
  | { type: "rollback"; original: Task }
  | { type: "remove"; id: string }
  | { type: "pending"; id: string; delta: 1 | -1 }
  | { type: "settings"; settings: BoardSettings };

export function initialBoardState(snapshot: BoardSnapshot): BoardState {
  return {
    tasks: Object.fromEntries(snapshot.tasks.map((t) => [t.id, t])),
    pending: {},
    deleted: {},
    members: snapshot.members,
    settings: snapshot.settings,
  };
}

/** Should `incoming` replace what we have locally? */
export function shouldAccept(local: Task | undefined, incoming: Task, isPending: boolean): boolean {
  if (!local) return true;
  // While our own change is in flight, only a strictly newer server version may replace it.
  return isPending ? incoming.version > local.version : incoming.version >= local.version;
}

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    case "snapshot": {
      const { snapshot, asOf } = action;
      const tasks: Record<string, Task> = {};
      const seen = new Set<string>();
      for (const incoming of snapshot.tasks) {
        if (state.deleted[incoming.id]) continue;
        seen.add(incoming.id);
        const local = state.tasks[incoming.id];
        tasks[incoming.id] = shouldAccept(local, incoming, !!state.pending[incoming.id]) ? incoming : local;
      }
      // Keep local tasks the snapshot doesn't know about only if they are newer than
      // the snapshot (created/changed while it was loading) or still being saved.
      for (const [id, local] of Object.entries(state.tasks)) {
        if (seen.has(id)) continue;
        if (state.pending[id] || local.updatedAt > asOf) tasks[id] = local;
      }
      return { ...state, tasks, members: snapshot.members, settings: snapshot.settings };
    }
    case "upsert": {
      if (state.deleted[action.task.id]) return state;
      const local = state.tasks[action.task.id];
      if (!shouldAccept(local, action.task, !!state.pending[action.task.id])) return state;
      return { ...state, tasks: { ...state.tasks, [action.task.id]: action.task } };
    }
    case "optimistic":
      return { ...state, tasks: { ...state.tasks, [action.task.id]: action.task } };
    case "rollback": {
      const local = state.tasks[action.original.id];
      // Only undo if nothing newer arrived in the meantime.
      if (!local || local.version !== action.original.version) return state;
      return { ...state, tasks: { ...state.tasks, [action.original.id]: action.original } };
    }
    case "remove": {
      if (!state.tasks[action.id] && state.deleted[action.id]) return state;
      const { [action.id]: _removed, ...rest } = state.tasks;
      void _removed;
      return { ...state, tasks: rest, deleted: { ...state.deleted, [action.id]: true } };
    }
    case "pending": {
      const count = (state.pending[action.id] ?? 0) + action.delta;
      const pending = { ...state.pending };
      if (count > 0) pending[action.id] = count;
      else delete pending[action.id];
      return { ...state, pending };
    }
    case "settings":
      return { ...state, settings: action.settings };
  }
}
