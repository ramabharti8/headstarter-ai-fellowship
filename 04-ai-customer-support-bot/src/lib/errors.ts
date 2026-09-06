import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { logger } from "./logger";

/** Application error with an HTTP status and a stable machine code. */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const Errors = {
  unauthorized: (msg = "Authentication required") => new AppError("unauthorized", msg, 401),
  forbidden: (msg = "You do not have access to this resource") =>
    new AppError("forbidden", msg, 403),
  notFound: (msg = "Resource not found") => new AppError("not_found", msg, 404),
  rateLimited: (retryAfterSec: number) =>
    new AppError("rate_limited", "Too many requests", 429, { retryAfterSec }),
  badRequest: (msg: string, details?: unknown) => new AppError("bad_request", msg, 400, details),
  payloadTooLarge: (msg = "Payload too large") => new AppError("payload_too_large", msg, 413),
};

type ErrorBody = { error: { code: string; message: string; details?: unknown } };

/** Convert any thrown value into a JSON error response with a consistent shape. */
export function toErrorResponse(err: unknown): NextResponse<ErrorBody> {
  if (err instanceof AppError) {
    const headers =
      err.code === "rate_limited" && err.details && typeof err.details === "object"
        ? { "Retry-After": String((err.details as { retryAfterSec: number }).retryAfterSec) }
        : undefined;
    return NextResponse.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      { status: err.status, headers },
    );
  }

  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "Invalid request", details: err.flatten() } },
      { status: 422 },
    );
  }

  logger.error({ err }, "unhandled error in route handler");
  return NextResponse.json(
    { error: { code: "internal_error", message: "Something went wrong" } },
    { status: 500 },
  );
}
