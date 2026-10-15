import "server-only";
import type { ChangeStream, ChangeStreamInsertDocument } from "mongodb";
import { getCollections, type EventDoc } from "@/lib/mongodb";
import { logger } from "@/lib/logger";
import { toBoardEvent } from "@/services/serializers";
import type { BoardEvent } from "@/types";

export interface HubListener {
  onEvent(event: BoardEvent): void;
  /** The stream broke; the listener should end its connection so the client reconnects and refetches. */
  onError(): void;
}

/**
 * One MongoDB change stream per server process, shared by every open SSE
 * connection in that process. It opens with the first listener and closes
 * with the last one.
 */
class EventHub {
  private listeners = new Set<HubListener>();
  private stream: ChangeStream<EventDoc, ChangeStreamInsertDocument<EventDoc>> | null = null;
  private ready: Promise<void> | null = null;

  get size() {
    return this.listeners.size;
  }

  /** Resolves once the change stream is live, so nothing written afterwards can be missed. */
  async subscribe(listener: HubListener): Promise<() => void> {
    this.listeners.add(listener);
    try {
      await this.start();
    } catch (err) {
      this.listeners.delete(listener);
      throw err;
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) void this.stop();
    };
  }

  private start(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const { events } = await getCollections();
      const stream = events.watch<EventDoc, ChangeStreamInsertDocument<EventDoc>>(
        [{ $match: { operationType: "insert" } }],
        { maxAwaitTimeMS: 5_000 },
      );
      this.stream = stream;
      stream.on("change", (change) => {
        const event = toBoardEvent(change.fullDocument);
        for (const l of [...this.listeners]) {
          try {
            l.onEvent(event);
          } catch (err) {
            logger.warn("SSE listener failed", { error: err });
          }
        }
      });
      stream.on("error", (err) => this.fail(err));
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Change stream did not start in time")), 10_000);
        // In event-emitter mode the driver doesn't forward "init"; the first resume
        // token arrives right after the server has opened the cursor.
        stream.once("resumeTokenChanged", () => {
          clearTimeout(timer);
          resolve();
        });
        stream.once("error", (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });
    })().catch(async (err) => {
      await this.stop();
      throw err;
    });
    return this.ready;
  }

  private fail(err: unknown) {
    logger.error("Change stream error", { error: err });
    const listeners = [...this.listeners];
    this.listeners.clear();
    void this.stop();
    for (const l of listeners) l.onError();
  }

  private async stop() {
    const stream = this.stream;
    this.stream = null;
    this.ready = null;
    if (stream) await stream.close().catch(() => undefined);
  }
}

const globalForHub = globalThis as unknown as { __tasklolHub?: EventHub };
export const eventHub: EventHub = globalForHub.__tasklolHub ?? (globalForHub.__tasklolHub = new EventHub());
