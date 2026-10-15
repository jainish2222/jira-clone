import "server-only";
import { z } from "zod";
import { AppError } from "@/lib/errors/app-error";
import { logger } from "@/lib/logger";

const envSchema = z.object({
  MONGODB_URI: z
    .string()
    .min(1, "MONGODB_URI is required")
    .refine((v) => /^mongodb(\+srv)?:\/\//.test(v), "MONGODB_URI must be a mongodb:// or mongodb+srv:// URI"),
  MONGODB_DB: z.string().min(1).default("tasklol"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  MONGODB_SERVER_SELECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  MONGODB_MAX_POOL_SIZE: z.coerce.number().int().positive().default(20),
  SSE_MAX_STREAM_MS: z.coerce.number().int().positive().default(270_000),
});

export type ServerEnv = z.infer<typeof envSchema>;

let cached: ServerEnv | null = null;

/**
 * Reads and validates server configuration. Throws a 503 AppError (never the raw
 * values) when something is missing, so callers can render a friendly message.
 */
export function getEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    logger.error("Invalid server configuration", {
      issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    });
    throw new AppError("SERVICE_NOT_CONFIGURED");
  }
  cached = parsed.data;
  return cached;
}

/** Test helper: forget the cached configuration so tests can change env vars. */
export function resetEnvCache() {
  cached = null;
}
