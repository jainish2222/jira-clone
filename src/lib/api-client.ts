"use client";

import type { ErrorCode } from "@/lib/errors/app-error";

export type ClientErrorCode = ErrorCode | "NETWORK_ERROR" | "TIMEOUT" | "BAD_RESPONSE";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ClientErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isNetwork() {
    return this.code === "NETWORK_ERROR" || this.code === "TIMEOUT";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  timeoutMs?: number;
  /** Extra attempts for transient failures (network, timeout, 503). Only use for safe requests. */
  retries?: number;
}

let unauthorizedHandler: (() => void) | null = null;
/** Called once when any request comes back 401 (session expired or revoked). */
export function onUnauthorized(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function requestOnce<T>(path: string, opts: RequestOptions): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000);
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new ApiError(0, "TIMEOUT", "The server took too long to respond.");
    }
    throw new ApiError(0, "NETWORK_ERROR", "Couldn't reach the server.", err);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 204) return undefined as T;
  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    throw new ApiError(res.status, "BAD_RESPONSE", "The server sent an unexpected response.");
  }
  const body = payload as { success?: boolean; data?: T; error?: { code: ErrorCode; message: string; details?: unknown } };
  if (res.ok && body.success) return body.data as T;
  if (res.status === 401) unauthorizedHandler?.();
  throw new ApiError(
    res.status,
    body.error?.code ?? "INTERNAL_ERROR",
    body.error?.message ?? "Something went wrong.",
    body.error?.details,
  );
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const attempts = 1 + (opts.retries ?? 0);
  for (let i = 0; ; i++) {
    try {
      return await requestOnce<T>(path, opts);
    } catch (err) {
      const transient = err instanceof ApiError && (err.isNetwork || err.status === 503);
      if (!transient || i >= attempts - 1) throw err;
      await sleep(500 * 2 ** i + Math.random() * 250); // bounded backoff with jitter
    }
  }
}

/** A short, human message for a failed request. */
export function friendlyError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.isNetwork) return "Couldn't reach the server. Check your connection and try again.";
    if (err.code === "DATABASE_UNAVAILABLE") return "The database is temporarily unavailable. Please try again.";
    if (err.code === "VALIDATION_FAILED") {
      const fields = (err.details as { fields?: { message: string }[] } | undefined)?.fields;
      if (fields?.length) return fields[0].message;
    }
    return err.message;
  }
  return "Something went wrong. Please try again.";
}

/** Field errors from a 422 response, keyed by field path. */
export function fieldErrors(err: unknown): Record<string, string> {
  if (!(err instanceof ApiError) || err.code !== "VALIDATION_FAILED") return {};
  const fields = (err.details as { fields?: { path: string; message: string }[] } | undefined)?.fields ?? [];
  return Object.fromEntries(fields.map((f) => [f.path, f.message]));
}

export function newRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
