import { authedRoute, ok } from "@/lib/api/respond";
import { getBoardSnapshot } from "@/services/board";

export const runtime = "nodejs";

/** Tasks + members + settings in one request; used for refetching after reconnects. */
export const GET = authedRoute(async () => ok(await getBoardSnapshot()));
