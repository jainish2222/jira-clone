import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stateless signed session token: base64url(payload).base64url(HMAC-SHA256).
 * The signature proves the server issued it; the database check (member active,
 * sessionVersion unchanged) happens in requireMember().
 */

export const SESSION_COOKIE = "tasklol_session";
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface SessionPayload {
  /** member id */
  m: string;
  /** member.sessionVersion at sign-in; bumping it revokes every session */
  v: number;
  /** issued-at, unix seconds */
  iat: number;
  /** expiry, unix seconds */
  exp: number;
}

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function createSessionToken(
  memberId: string,
  sessionVersion: number,
  secret: string,
  now: number = Date.now(),
): string {
  const iat = Math.floor(now / 1000);
  const payload: SessionPayload = { m: memberId, v: sessionVersion, iat, exp: iat + SESSION_TTL_SECONDS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

export function verifySessionToken(
  token: string | undefined | null,
  secret: string,
  now: number = Date.now(),
): SessionPayload | null {
  if (!token || token.length > 1024) return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot !== token.lastIndexOf(".")) return null;
  const body = token.slice(0, dot);
  const sig = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(body, secret));
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<SessionPayload>;
    if (
      typeof p.m !== "string" ||
      !/^[a-f\d]{24}$/.test(p.m) ||
      typeof p.v !== "number" ||
      typeof p.iat !== "number" ||
      typeof p.exp !== "number"
    ) {
      return null;
    }
    if (p.exp * 1000 <= now) return null;
    return p as SessionPayload;
  } catch {
    return null;
  }
}

/** Reads one cookie from a Cookie header without extra dependencies. */
export function readCookie(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}
