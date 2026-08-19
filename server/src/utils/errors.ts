/**
 * A single error type carries an HTTP status, a stable machine-readable code
 * and optional field-level details. The global error handler is then trivial
 * and every route can `throw` instead of threading `res` through helpers.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace?.(this, AppError);
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', message, details);

export const unauthorized = (message = 'Authentication required.') =>
  new AppError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'You do not have access to this resource.') =>
  new AppError(403, 'FORBIDDEN', message);

export const notFound = (what = 'Resource') =>
  new AppError(404, 'NOT_FOUND', `${what} not found.`);

export const conflict = (message: string, details?: unknown) =>
  new AppError(409, 'CONFLICT', message, details);

export const unprocessable = (message: string, details?: unknown) =>
  new AppError(422, 'UNPROCESSABLE', message, details);

/**
 * Raised by the rate engine when no rate card covers a lane. This is a
 * configuration gap rather than a bug, so it surfaces with actionable copy.
 */
export const rateNotConfigured = (message: string, details?: unknown) =>
  new AppError(422, 'RATE_NOT_CONFIGURED', message, details);

/** Raised when a pincode is not mapped to any zone. */
export const zoneNotServiceable = (pincode: string) =>
  new AppError(
    422,
    'ZONE_NOT_SERVICEABLE',
    `Pincode ${pincode} is not mapped to a delivery zone yet. An admin can add it under Zones -> Areas.`,
    { pincode },
  );
