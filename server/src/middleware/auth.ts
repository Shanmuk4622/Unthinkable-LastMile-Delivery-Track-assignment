/**
 * Authentication + authorisation middleware.
 *
 * `authenticate` proves *who* you are (JWT -> req.auth).
 * `authorize`    proves *what* you may do (role allow-list).
 *
 * Agents additionally get their AgentProfile id resolved once here, because
 * almost every agent-facing query needs it and re-fetching it per handler
 * would be a needless round trip.
 */
import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { forbidden, unauthorized } from '../utils/errors';
import { verifyAccessToken } from '../services/authService';
import type { Role } from '../domain/constants';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: {
        id: string;
        role: Role;
        name: string;
        email: string;
        /** AgentProfile.id — present only for AGENT accounts. */
        agentProfileId: string | null;
      };
    }
  }
}

function bearerFrom(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  const cookie = (req as Request & { cookies?: Record<string, string> }).cookies?.accessToken;
  return cookie ?? null;
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = bearerFrom(req);
    if (!token) throw unauthorized();

    const payload = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        role: true,
        fullName: true,
        email: true,
        isActive: true,
        agentProfile: { select: { id: true } },
      },
    });

    if (!user) throw unauthorized('Your account no longer exists.');
    if (!user.isActive) throw forbidden('This account has been deactivated.');

    req.auth = {
      id: user.id,
      role: user.role as Role,
      name: user.fullName,
      email: user.email,
      agentProfileId: user.agentProfile?.id ?? null,
    };

    next();
  } catch (error) {
    next(error);
  }
}

/** Attach `req.auth` when a valid token is present, but never reject. */
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  if (!bearerFrom(req)) return next();
  try {
    await authenticate(req, res, next);
  } catch {
    next();
  }
}

export function authorize(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(unauthorized());
    if (roles.length === 0 || roles.includes(req.auth.role)) return next();
    return next(
      forbidden(
        `This action requires the ${roles.map((r) => r.toLowerCase()).join(' or ')} role.`,
      ),
    );
  };
}

/** Convenience for handlers: the authenticated actor, or throw. */
export function actorOf(req: Request) {
  if (!req.auth) throw unauthorized();
  return { id: req.auth.id, role: req.auth.role, name: req.auth.name };
}
