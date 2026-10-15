import { clientIp, isSecureRequest, sessionSetCookie } from "@/lib/auth/cookies";
import { createSessionToken } from "@/lib/auth/session";
import { ok, parseWith, publicRoute, readJson } from "@/lib/api/respond";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors/app-error";
import { loginLimiter } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validations/auth";
import { authenticate } from "@/services/members";

export const runtime = "nodejs";

export const POST = publicRoute(async ({ req }) => {
  const wait = loginLimiter.hit(clientIp(req));
  if (wait > 0) throw new AppError("RATE_LIMITED", { headers: { "Retry-After": String(wait) } });

  const { username, password } = parseWith(loginSchema, await readJson(req));
  const { member, sessionVersion } = await authenticate(username, password);
  const token = createSessionToken(member.id, sessionVersion, getEnv().SESSION_SECRET);
  return ok({ member }, { headers: { "Set-Cookie": sessionSetCookie(token, isSecureRequest(req)) } });
});
