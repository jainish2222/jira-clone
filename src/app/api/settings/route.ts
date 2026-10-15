import { authedRoute, ok, parseWith, readJson } from "@/lib/api/respond";
import { updateSettingsSchema } from "@/lib/validations/settings";
import { getSettings, updateSettings } from "@/services/settings";

export const runtime = "nodejs";

export const GET = authedRoute(async () => ok({ settings: await getSettings() }));

export const PATCH = authedRoute(async ({ req, member }) => {
  const input = parseWith(updateSettingsSchema, await readJson(req));
  return ok(await updateSettings(input, member.id));
});
