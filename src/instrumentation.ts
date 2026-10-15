import type { Instrumentation } from "next";

export async function register() {
  // Connect an error tracker here, e.g.:
  //   const Sentry = await import("@sentry/nextjs");
  //   const { setErrorReporter } = await import("@/lib/logger");
  //   setErrorReporter((err, ctx) => Sentry.captureException(err, { extra: ctx }));
}

/** Errors thrown while rendering pages (route handlers report through logger.exception). */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const { logger } = await import("@/lib/logger");
  logger.exception(err, {
    path: request.path,
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
    digest: typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : undefined,
  });
};
