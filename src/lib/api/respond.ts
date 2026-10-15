import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AppError, isAppError } from "@/lib/errors/app-error";
import { toDatabaseUnavailable } from "@/lib/mongodb";
import { logger } from "@/lib/logger";
import { writeLimiter } from "@/lib/rate-limit";
import { requireMember } from "@/services/members";
import type { Member, SuccessBody } from "@/types";

export const MAX_BODY_BYTES = 32 * 1024;

export function ok<T>(data: T, init: { status?: number; headers?: HeadersInit } = {}): Response {
  const body: SuccessBody<T> = { success: true, data };
  return Response.json(body, {
    status: init.status ?? 200,
    headers: { "Cache-Control": "no-store", ...init.headers },
  });
}

export function noContent(): Response {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

/** Converts any thrown value into the standard error response. Never leaks internals. */
export function errorResponse(err: unknown, requestId: string, context: Record<string, unknown> = {}): Response {
  let appError: AppError;
  if (isAppError(err)) {
    appError = err;
    if (appError.status >= 500) logger.error(appError.code, { ...context, requestId, cause: appError.cause });
  } else {
    const unavailable = toDatabaseUnavailable(err);
    if (unavailable) {
      logger.error("Database unavailable", { ...context, requestId, error: err });
      appError = unavailable;
    } else {
      logger.exception(err, { ...context, requestId });
      appError = new AppError("INTERNAL_ERROR");
    }
  }
  return Response.json(appError.toBody(), {
    status: appError.status,
    headers: {
      "Cache-Control": "no-store",
      "X-Request-Id": requestId,
      ...(appError.status === 503 ? { "Retry-After": "5" } : {}),
      ...appError.headers,
    },
  });
}

/** Converts a Zod failure into a 422 with field-level messages the UI can show. */
export function validationError(error: z.ZodError): AppError {
  return new AppError("VALIDATION_FAILED", {
    details: {
      fields: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    },
  });
}

export function parseWith<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw validationError(result.error);
  return result.data;
}

/** Reads a JSON body with content-type, size and syntax checks (415 / 413 / 400). */
export async function readJson(req: Request): Promise<unknown> {
  const type = req.headers.get("content-type") ?? "";
  if (!/^application\/json\b/i.test(type)) throw new AppError("UNSUPPORTED_MEDIA_TYPE");
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) throw new AppError("PAYLOAD_TOO_LARGE");
  const text = await req.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) throw new AppError("PAYLOAD_TOO_LARGE");
  if (text.trim() === "") throw new AppError("INVALID_JSON");
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("INVALID_JSON");
  }
}

export function searchParamsObject(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  new URL(req.url).searchParams.forEach((v, k) => {
    if (v !== "") out[k] = v;
  });
  return out;
}

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Browsers always send Origin on cross-origin writes. Rejecting a mismatching
 * Origin (plus SameSite=Lax cookies) protects against cross-site request forgery.
 */
function assertSameOrigin(req: Request) {
  if (!UNSAFE_METHODS.has(req.method)) return;
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser clients (CLI, tests) don't send Origin
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AppError("FORBIDDEN");
  }
  if (!host || originHost !== host) throw new AppError("FORBIDDEN");
}

export interface RouteContext<P> {
  req: Request;
  requestId: string;
  params: P;
}

export interface AuthedRouteContext<P> extends RouteContext<P> {
  member: Member;
}

type NextRouteContext<P> = { params: Promise<P> };

/** Wraps a public route handler with request ids, CSRF checks and error mapping. */
export function publicRoute<P = Record<string, never>>(handler: (ctx: RouteContext<P>) => Promise<Response>) {
  return async (req: Request, context: NextRouteContext<P>): Promise<Response> => {
    const requestId = randomUUID();
    try {
      assertSameOrigin(req);
      const params = (await context?.params) ?? ({} as P);
      return await handler({ req, requestId, params });
    } catch (err) {
      return errorResponse(err, requestId, { method: req.method, path: new URL(req.url).pathname });
    }
  };
}

/** Like publicRoute, but requires a valid session and rate-limits writes per member. */
export function authedRoute<P = Record<string, never>>(handler: (ctx: AuthedRouteContext<P>) => Promise<Response>) {
  return publicRoute<P>(async (ctx) => {
    const member = await requireMember(ctx.req);
    if (UNSAFE_METHODS.has(ctx.req.method)) {
      const wait = writeLimiter.hit(member.id);
      if (wait > 0) throw new AppError("RATE_LIMITED", { headers: { "Retry-After": String(wait) } });
    }
    return handler({ ...ctx, member });
  });
}
