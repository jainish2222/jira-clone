import { z } from "zod";

export const updateSettingsSchema = z.strictObject({
  reactionVisibility: z.enum(["self", "everyone"], {
    error: "reactionVisibility must be self or everyone",
  }),
});
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
