/**
 * Every error the API can return. The message is safe to show to a user;
 * internal details belong in server logs only.
 */
export const ERROR_DEFINITIONS = {
  BAD_REQUEST: { status: 400, message: "The request could not be understood." },
  INVALID_JSON: { status: 400, message: "The request body is not valid JSON." },
  INVALID_ID: { status: 400, message: "That task identifier is not valid." },
  UNAUTHORIZED: { status: 401, message: "Please sign in to continue." },
  INVALID_CREDENTIALS: { status: 401, message: "Incorrect username or password." },
  FORBIDDEN: { status: 403, message: "You don't have access to do that." },
  TASK_NOT_FOUND: { status: 404, message: "The requested task was not found." },
  NOT_FOUND: { status: 404, message: "Not found." },
  VERSION_CONFLICT: {
    status: 409,
    message: "Someone else changed this task. The board has been updated.",
  },
  PAYLOAD_TOO_LARGE: { status: 413, message: "The request is too large." },
  UNSUPPORTED_MEDIA_TYPE: { status: 415, message: "Requests must be sent as JSON." },
  VALIDATION_FAILED: { status: 422, message: "Some fields are invalid." },
  ACCOUNT_LOCKED: {
    status: 429,
    message: "Too many failed sign-in attempts. Try again in a few minutes.",
  },
  RATE_LIMITED: { status: 429, message: "You're going a little fast. Please try again shortly." },
  INTERNAL_ERROR: { status: 500, message: "Something went wrong on our side." },
  DATABASE_UNAVAILABLE: {
    status: 503,
    message: "The database is temporarily unavailable. Please try again.",
  },
  SERVICE_NOT_CONFIGURED: {
    status: 503,
    message: "The service is not configured yet. Please contact the board admin.",
  },
} as const;

export type ErrorCode = keyof typeof ERROR_DEFINITIONS;

export interface ErrorBody {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  /** Safe, user-facing extra data (validation issues, the current task on 409...). */
  readonly details?: unknown;
  readonly headers?: Record<string, string>;

  constructor(
    code: ErrorCode,
    options: { message?: string; details?: unknown; cause?: unknown; headers?: Record<string, string> } = {},
  ) {
    super(options.message ?? ERROR_DEFINITIONS[code].message, { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.status = ERROR_DEFINITIONS[code].status;
    this.details = options.details;
    this.headers = options.headers;
  }

  toBody(): ErrorBody {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        ...(this.details === undefined ? {} : { details: this.details }),
      },
    };
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
