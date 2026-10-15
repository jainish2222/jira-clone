import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

/**
 * First line of defence: anything without a validly *signed* session cookie is
 * sent to /login (pages) or gets a 401 (API). This check needs no database; the
 * full check (member still active, session not revoked) runs in every route.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const secret = process.env.SESSION_SECRET;
  const isApi = pathname.startsWith("/api/");

  if (!secret || secret.length < 32) {
    // Misconfigured: let pages render their own "not configured" state; APIs answer 503.
    if (isApi) {
      return NextResponse.json(
        { success: false, error: { code: "SERVICE_NOT_CONFIGURED", message: "The service is not configured yet." } },
        { status: 503 },
      );
    }
    return NextResponse.next();
  }

  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, secret);
  if (session) return NextResponse.next();

  if (isApi) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Please sign in to continue." } },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    // Everything except: the login page & sign-in API, health check, static files and memes.
    "/((?!login|api/auth/login|api/auth/logout|api/health|_next/|icon.svg|memes/).*)",
  ],
};
