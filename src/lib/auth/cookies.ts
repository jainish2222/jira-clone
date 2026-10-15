import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";

export function isSecureRequest(req: Request): boolean {
  const proto = req.headers.get("x-forwarded-proto");
  if (proto) return proto.split(",")[0].trim() === "https";
  return new URL(req.url).protocol === "https:";
}

export function sessionSetCookie(token: string, secure: boolean): string {
  const o = sessionCookieOptions(secure);
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    `Path=${o.path}`,
    `Max-Age=${o.maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(o.secure ? ["Secure"] : []),
  ].join("; ");
}

export function sessionClearCookie(secure: boolean): string {
  return [`${SESSION_COOKIE}=`, "Path=/", "Max-Age=0", "HttpOnly", "SameSite=Lax", ...(secure ? ["Secure"] : [])].join(
    "; ",
  );
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
