import { getDb } from "@/lib/mongodb";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * Public liveness/readiness probe for uptime monitors. Reveals nothing beyond
 * "ok" or "degraded" — no versions, hosts or error text.
 */
export async function GET() {
  const started = Date.now();
  try {
    const db = await getDb();
    await Promise.race([
      db.command({ ping: 1 }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("ping timeout")), 3000)),
    ]);
    return Response.json(
      { status: "ok", database: "ok", latencyMs: Date.now() - started },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    logger.error("Health check failed", { error: err });
    return Response.json(
      { status: "degraded", database: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "10" } },
    );
  }
}
