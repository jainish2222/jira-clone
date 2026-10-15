"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { toast } from "sonner";
import { api, ApiError, friendlyError, newRequestId } from "@/lib/api-client";
import { positionBetween } from "@/lib/tasks/position";
import { getReactionCategory } from "@/lib/tasks/transitions";
import { useReactions } from "@/components/reactions/reaction-provider";
import {
  HISTORY_EVENT_TYPES,
  type BoardEvent,
  type BoardSettings,
  type BoardSnapshot,
  type Member,
  type ReactionVisibility,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "@/types";
import { boardReducer, initialBoardState } from "./board-state";

export interface TaskDraft {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  labels: string[];
  assigneeId: string | null;
}

export type TaskPatch = Partial<TaskDraft>;

const MAX_LIVE_ACTIVITY = 50;
const MAX_SEEN_EVENTS = 500;

function assertOnline() {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new ApiError(0, "NETWORK_ERROR", "You're offline. Changes can't be saved until you reconnect.");
  }
}

export function useBoard(initial: BoardSnapshot, me: Member) {
  const [state, dispatch] = useReducer(boardReducer, initial, initialBoardState);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const { play, cancel } = useReactions();
  /** Tasks whose reaction this tab already showed instantly on drop (taskId -> local reaction id). */
  const instantReactions = useRef(new Map<string, string>());
  const [liveActivity, setLiveActivity] = useState<BoardEvent[]>([]);
  const [unseenActivity, setUnseenActivity] = useState(0);
  const [syncError, setSyncError] = useState<string | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const lastSync = useRef(0);
  useEffect(() => {
    lastSync.current = Date.now();
  }, []);

  const membersById = useMemo(() => new Map(state.members.map((m) => [m.id, m])), [state.members]);
  const membersRef = useRef(membersById);
  useEffect(() => {
    membersRef.current = membersById;
  }, [membersById]);

  // ---- Server reconciliation ----------------------------------------------

  const syncSeq = useRef(0);
  const refetch = useCallback(async () => {
    const seq = ++syncSeq.current;
    try {
      const snapshot = await api<BoardSnapshot>("/api/board", { retries: 2 });
      if (seq !== syncSeq.current) return; // a newer refetch superseded this one
      dispatch({ type: "snapshot", snapshot, asOf: snapshot.serverTime });
      lastSync.current = Date.now();
      setSyncError(null);
    } catch (err) {
      if (seq === syncSeq.current && !(err instanceof ApiError && err.status === 401)) {
        setSyncError(friendlyError(err));
      }
    }
  }, []);

  // Catch up when the tab regains focus after a while (laptop sleep, etc.).
  useEffect(() => {
    const onFocus = () => {
      if (Date.now() - lastSync.current > 60_000) void refetch();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refetch]);

  /** Applies one board event, whether it came from the live stream or our own request. */
  const handleEvent = useCallback(
    (event: BoardEvent) => {
      if (seen.current.has(event.id)) return;
      seen.current.add(event.id);
      if (seen.current.size > MAX_SEEN_EVENTS) {
        const first = seen.current.values().next().value;
        if (first) seen.current.delete(first);
      }

      if (event.type === "deleted" && event.taskId) dispatch({ type: "remove", id: event.taskId });
      else if (event.task) dispatch({ type: "upsert", task: event.task });
      if (event.type === "settings_changed" && event.settings) dispatch({ type: "settings", settings: event.settings });

      if (HISTORY_EVENT_TYPES.includes(event.type)) {
        setLiveActivity((list) => [event, ...list].slice(0, MAX_LIVE_ACTIVITY));
        if (event.actorId !== me.id) setUnseenActivity((n) => n + 1);
      }

      if (event.type === "status_changed" && event.reaction && event.task) {
        const isSelf = event.actorId === me.id;
        // Our own drag already played its meme the moment the card was dropped.
        const alreadyShown = isSelf && event.taskId !== null && instantReactions.current.has(event.taskId);
        if (!alreadyShown && (isSelf || stateRef.current.settings.reactionVisibility === "everyone")) {
          play({
            eventId: event.id,
            category: event.reaction,
            taskKey: event.task.key,
            taskTitle: event.task.title,
            toStatus: event.task.status,
            actorName: membersRef.current.get(event.actorId)?.name ?? "A teammate",
            isSelf,
          });
        }
      }
    },
    [me.id, play],
  );

  // ---- Mutations ----------------------------------------------------------

  const createTask = useCallback(
    async (draft: TaskDraft, clientRequestId: string = newRequestId()): Promise<Task> => {
      assertOnline();
      const res = await api<{ task: Task; event: BoardEvent | null }>("/api/tasks", {
        method: "POST",
        body: { ...draft, clientRequestId },
      });
      if (res.event) handleEvent(res.event);
      else dispatch({ type: "upsert", task: res.task });
      return res.task;
    },
    [handleEvent],
  );

  /** Saves field edits. On 409 the board is updated to the latest version and the error is rethrown. */
  const updateTask = useCallback(
    async (task: Task, patch: TaskPatch, baseVersion: number = task.version): Promise<Task> => {
      assertOnline();
      dispatch({ type: "pending", id: task.id, delta: 1 });
      try {
        const res = await api<{ task: Task; events: BoardEvent[] }>(`/api/tasks/${task.id}`, {
          method: "PATCH",
          // The version the user started editing from: if anyone saved since, the server answers 409.
          body: { version: baseVersion, ...patch },
        });
        dispatch({ type: "pending", id: task.id, delta: -1 });
        dispatch({ type: "upsert", task: res.task });
        res.events.forEach(handleEvent);
        return res.task;
      } catch (err) {
        dispatch({ type: "pending", id: task.id, delta: -1 });
        if (err instanceof ApiError && err.code === "VERSION_CONFLICT") {
          const current = (err.details as { task?: Task } | undefined)?.task;
          if (current) dispatch({ type: "upsert", task: current });
        } else if (err instanceof ApiError && err.code === "TASK_NOT_FOUND") {
          dispatch({ type: "remove", id: task.id });
        }
        throw err;
      }
    },
    [handleEvent],
  );

  /**
   * Drag-and-drop / status change. Updates the board immediately, saves in the
   * background, and puts the card back (with a message) if saving fails.
   */
  const moveTask = useCallback(
    async (taskId: string, toStatus: TaskStatus, prevId: string | null, nextId: string | null) => {
      const s = stateRef.current;
      const original = s.tasks[taskId];
      if (!original || s.pending[taskId]) return; // ignore repeated drags while a save is in flight
      try {
        assertOnline();
      } catch (err) {
        toast.error(friendlyError(err));
        return;
      }

      const prev = prevId ? s.tasks[prevId] : undefined;
      const next = nextId ? s.tasks[nextId] : undefined;
      const lower = prev?.position ?? null;
      const upper = next?.position ?? null;
      const position = positionBetween(lower, upper) ?? (lower ?? 0) + 1e-9;
      const statusChanged = toStatus !== original.status;
      if (!statusChanged && position === original.position) return;

      dispatch({ type: "optimistic", task: { ...original, status: toStatus, position } });
      dispatch({ type: "pending", id: taskId, delta: 1 });

      // Play the meme right away instead of waiting for the database round trip.
      // Teammates still only see it after the server has saved the change.
      let instantId: string | null = null;
      if (statusChanged) {
        const othersOpen = Object.values(s.tasks).some((t) => t.id !== taskId && t.status !== "done");
        const category =
          toStatus === "done" && !othersOpen ? "all_done" : getReactionCategory(original.status, toStatus);
        if (category) {
          instantId = `local:${taskId}:${Date.now()}`;
          instantReactions.current.set(taskId, instantId);
          play({
            eventId: instantId,
            category,
            taskKey: original.key,
            taskTitle: original.title,
            toStatus,
            actorName: me.name,
            isSelf: true,
          });
        }
      }
      const forgetInstant = () => {
        if (instantId && instantReactions.current.get(taskId) === instantId) instantReactions.current.delete(taskId);
      };

      try {
        const res = await api<{ task: Task; events: BoardEvent[] }>(`/api/tasks/${taskId}`, {
          method: "PATCH",
          body: {
            version: original.version,
            ...(statusChanged ? { status: toStatus } : {}),
            placement: { prevId: prevId ?? null, nextId: nextId ?? null },
          },
        });
        dispatch({ type: "pending", id: taskId, delta: -1 });
        dispatch({ type: "upsert", task: res.task });
        res.events.forEach(handleEvent); // marks the saved event as seen, so the live stream won't replay it
        forgetInstant();
      } catch (err) {
        dispatch({ type: "pending", id: taskId, delta: -1 });
        if (instantId) cancel(instantId); // the move didn't happen, so neither does the meme
        forgetInstant();
        if (err instanceof ApiError && err.code === "VERSION_CONFLICT") {
          const current = (err.details as { task?: Task } | undefined)?.task;
          if (current) dispatch({ type: "upsert", task: current });
          else dispatch({ type: "rollback", original });
          toast.warning("Someone else just changed this task. The board has been updated.");
        } else if (err instanceof ApiError && err.code === "TASK_NOT_FOUND") {
          dispatch({ type: "remove", id: taskId });
          toast.warning("That task was deleted by someone else.");
        } else {
          dispatch({ type: "rollback", original });
          toast.error("Couldn't save that change. Your task has been restored.", {
            description: err instanceof ApiError && err.status === 503 ? friendlyError(err) : undefined,
          });
        }
        void refetch();
      }
    },
    [handleEvent, refetch, play, cancel, me.name],
  );

  const deleteTask = useCallback(async (task: Task): Promise<void> => {
    assertOnline();
    dispatch({ type: "pending", id: task.id, delta: 1 });
    try {
      await api<void>(`/api/tasks/${task.id}?version=${task.version}`, { method: "DELETE" });
      dispatch({ type: "remove", id: task.id });
    } catch (err) {
      if (err instanceof ApiError && err.code === "TASK_NOT_FOUND") {
        dispatch({ type: "remove", id: task.id }); // already gone — that's what the user wanted
        return;
      }
      if (err instanceof ApiError && err.code === "VERSION_CONFLICT") {
        const current = (err.details as { task?: Task } | undefined)?.task;
        if (current) dispatch({ type: "upsert", task: current });
      }
      throw err;
    } finally {
      dispatch({ type: "pending", id: task.id, delta: -1 });
    }
  }, []);

  const setReactionVisibility = useCallback(
    async (reactionVisibility: ReactionVisibility) => {
      assertOnline();
      const res = await api<{ settings: BoardSettings; event: BoardEvent }>("/api/settings", {
        method: "PATCH",
        body: { reactionVisibility },
      });
      dispatch({ type: "settings", settings: res.settings });
      handleEvent(res.event);
    },
    [handleEvent],
  );

  const markActivitySeen = useCallback(() => setUnseenActivity(0), []);

  return {
    state,
    membersById,
    liveActivity,
    unseenActivity,
    syncError,
    refetch,
    handleEvent,
    createTask,
    updateTask,
    moveTask,
    deleteTask,
    setReactionVisibility,
    markActivitySeen,
  };
}

export type BoardController = ReturnType<typeof useBoard>;
