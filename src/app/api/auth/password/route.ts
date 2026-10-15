import { isSecureRequest, sessionSetCookie } from "@/lib/auth/cookies";
import { createSessionToken } from "@/lib/auth/session";
import { authedRoute, ok, parseWith, readJson } from "@/lib/api/respond";
import { getEnv } from "@/lib/env";
import { changePasswordSchema } from "@/lib/validations/auth";
import { changePassword } from "@/services/members";

export const runtime = "nodejs";

/** Changes the caller's password, signs out their other devices, keeps this one signed in. */
export const POST = authedRoute(async ({ req, member }) => {
  const input = parseWith(changePasswordSchema, await readJson(req));
  const sessionVersion = await changePassword(member.id, input.currentPassword, input.newPassword);
  const token = createSessionToken(member.id, sessionVersion, getEnv().SESSION_SECRET);
  return ok({ member }, { headers: { "Set-Cookie": sessionSetCookie(token, isSecureRequest(req)) } });
});
