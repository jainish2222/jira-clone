import { isSecureRequest, sessionClearCookie } from "@/lib/auth/cookies";
import { publicRoute } from "@/lib/api/respond";

export const runtime = "nodejs";

export const POST = publicRoute(async ({ req }) => {
  return new Response(null, {
    status: 204,
    headers: { "Set-Cookie": sessionClearCookie(isSecureRequest(req)), "Cache-Control": "no-store" },
  });
});
