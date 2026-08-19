/**
 * Request validation.
 *
 * Every route declares Zod schemas for the parts of the request it reads. The
 * parsed (and coerced) result replaces the raw value, so handlers work with
 * typed data and never re-check anything.
 */
import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { AppError } from '../utils/errors';

export interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

export function validate(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params);
      if (schemas.query) {
        // Express 5 makes req.query a getter; assign onto a fresh object.
        Object.defineProperty(req, 'query', {
          value: schemas.query.parse(req.query),
          writable: true,
          configurable: true,
        });
      }
      if (schemas.body) req.body = schemas.body.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(
          new AppError(422, 'VALIDATION_ERROR', 'Some of the details you entered are not valid.', {
            fields: error.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          }),
        );
        return;
      }
      next(error);
    }
  };
}

/**
 * Wrap an async handler so a rejected promise reaches the error middleware
 * instead of hanging the request. (Express 4 does not do this for us.)
 */
export function asyncHandler<T extends (req: Request, res: Response, next: NextFunction) => unknown>(
  handler: T,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
