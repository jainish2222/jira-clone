type Level = "debug" | "info" | "warn" | "error";

const REDACT_KEYS = /pass(word)?|secret|token|cookie|authorization|mongodb_uri|^uri$/i;
const URI_CREDENTIALS = /(mongodb(?:\+srv)?:\/\/)[^@/\s]+@/gi;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[depth]";
  if (typeof value === "string") return value.replace(URI_CREDENTIALS, "$1***@");
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redact(value.message, depth + 1),
      ...("code" in value ? { code: (value as { code?: unknown }).code } : {}),
    };
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = REDACT_KEYS.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

type ErrorReporter = (error: unknown, context: Record<string, unknown>) => void;
let reporter: ErrorReporter | null = null;

/**
 * Hook for an error-tracking provider (Sentry, Logtail, ...). Register it once,
 * e.g. in instrumentation.ts: setErrorReporter((err, ctx) => Sentry.captureException(err, { extra: ctx })).
 */
export function setErrorReporter(fn: ErrorReporter | null) {
  reporter = fn;
}

function write(level: Level, msg: string, context: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV === "test" && level !== "error" && !process.env.LOG_IN_TESTS) return;
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    msg,
    ...(redact(context) as Record<string, unknown>),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => write("debug", msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => write("info", msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => write("warn", msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => write("error", msg, ctx),
  /** Logs an unexpected error and forwards it to the registered reporter. */
  exception(error: unknown, ctx: Record<string, unknown> = {}) {
    write("error", "Unhandled error", { ...ctx, error });
    try {
      reporter?.(error, ctx);
    } catch {
      // A broken reporter must never break request handling.
    }
  },
};
