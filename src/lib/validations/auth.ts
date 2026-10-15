import { z } from "zod";

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 200;

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "Username must be at least 2 characters")
  .max(32, "Username must be 32 characters or fewer")
  .regex(/^[a-z0-9._-]+$/, "Use letters, numbers, dots, dashes or underscores");

export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`)
  .max(PASSWORD_MAX, `Password must be ${PASSWORD_MAX} characters or fewer`);

export const loginSchema = z.strictObject({
  // Login only checks shape loosely; a bad username simply fails to authenticate.
  username: z.string().trim().toLowerCase().min(1, "Enter your username").max(64),
  password: z.string().min(1, "Enter your password").max(PASSWORD_MAX),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .strictObject({
    currentPassword: z.string().min(1, "Enter your current password").max(PASSWORD_MAX),
    newPassword: newPasswordSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: "Choose a password you haven't used here",
    path: ["newPassword"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const memberNameSchema = z.string().trim().min(1).max(60);
