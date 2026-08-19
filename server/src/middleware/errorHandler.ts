/**
 * Terminal error middleware + 404 handler.
 *
 * Produces one consistent envelope for every failure:
 *   { success: false, error: { code, message, details? } }
 *
 * Prisma's own error codes are translated into human sentences here rather than
 * leaking `P2002` to a customer.
 */
import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { env } from '../config/env';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `No route matches ${req.method} ${req.originalUrl}.`,
    },
  });
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
) {
  const mapped = mapError(error);

  if (mapped.status >= 500) {
    logger.error(mapped.message, {
      path: `${req.method} ${req.originalUrl}`,
      stack: error instanceof Error ? error.stack : undefined,
    });
  } else {
    logger.debug(`${mapped.status} ${mapped.code}`, {
      path: `${req.method} ${req.originalUrl}`,
      message: mapped.message,
    });
  }

  res.status(mapped.status).json({
    success: false,
    error: {
      code: mapped.code,
      message: mapped.message,
      ...(mapped.details !== undefined ? { details: mapped.details } : {}),
      ...(env.isProd || !(error instanceof Error) ? {} : { stack: error.stack?.split('\n', 4) }),
    },
  });
}

function mapError(error: unknown): {
  status: number;
  code: string;
  message: string;
  details?: unknown;
} {
  if (error instanceof AppError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002': {
        const target = (error.meta?.target as string[] | string | undefined) ?? 'value';
        const field = Array.isArray(target) ? target.join(', ') : String(target);
        return {
          status: 409,
          code: 'DUPLICATE',
          message: `That ${field} is already in use.`,
          details: { field },
        };
      }
      case 'P2003':
        return {
          status: 409,
          code: 'FOREIGN_KEY',
          message: 'That record is referenced by other data and cannot be changed.',
        };
      case 'P2025':
        return { status: 404, code: 'NOT_FOUND', message: 'The requested record does not exist.' };
      default:
        return {
          status: 400,
          code: `PRISMA_${error.code}`,
          message: 'The database rejected that request.',
        };
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return { status: 400, code: 'PRISMA_VALIDATION', message: 'Malformed database query.' };
  }

  if (error instanceof SyntaxError && 'body' in error) {
    return { status: 400, code: 'MALFORMED_JSON', message: 'The request body is not valid JSON.' };
  }

  return {
    status: 500,
    code: 'INTERNAL_ERROR',
    message:
      error instanceof Error && !env.isProd
        ? error.message
        : 'Something went wrong on our side. Please try again.',
  };
}
