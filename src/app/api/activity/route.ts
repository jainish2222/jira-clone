import { z } from "zod";
import { authedRoute, ok, parseWith, searchParamsObject } from "@/lib/api/respond";
import { objectIdSchema } from "@/lib/validations/task";
import { listActivity } from "@/services/activity";

export const runtime = "nodejs";

const querySchema = z.strictObject({
  taskId: objectIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const GET = authedRoute(async ({ req }) => {
  const query = parseWith(querySchema, searchParamsObject(req));
  return ok({ events: await listActivity(query) });
});
