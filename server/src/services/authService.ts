/**
 * Authentication.
 * ---------------------------------------------------------------------------
 * Short-lived JWT access tokens (2 h) paired with long-lived, rotating,
 * hash-stored refresh tokens (30 d).
 *
 * Why rotation: a stolen refresh token is only useful until the legitimate
 * client next refreshes, at which point the stolen copy is already revoked.
 * Why hashing: the tokens table is the highest-value target in the database;
 * storing SHA-256 digests means a dump of it cannot mint a single session.
 */
import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { badRequest, conflict, unauthorized } from '../utils/errors';
import { generateOpaqueToken, sha256 } from '../utils/serialize';
import type { Role } from '../domain/constants';
import * as notifications from './notifications';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  name: string;
  email: string;
}

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface PublicUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: Role;
  companyName: string | null;
  isActive: boolean;
  createdAt: Date;
  agentProfile?: {
    id: string;
    availability: string;
    vehicleType: string;
    vehicleNumber: string | null;
    zoneId: string | null;
    activeOrderCount: number;
    maxConcurrentOrders: number;
    currentLat: number | null;
    currentLng: number | null;
  } | null;
}

const AGENT_PROFILE_SELECT = {
  id: true,
  availability: true,
  vehicleType: true,
  vehicleNumber: true,
  zoneId: true,
  activeOrderCount: true,
  maxConcurrentOrders: true,
  currentLat: true,
  currentLng: true,
} as const;

export function toPublicUser(user: {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: string;
  companyName: string | null;
  isActive: boolean;
  createdAt: Date;
  agentProfile?: PublicUser['agentProfile'];
}): PublicUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    role: user.role as Role,
    companyName: user.companyName,
    isActive: user.isActive,
    createdAt: user.createdAt,
    agentProfile: user.agentProfile ?? null,
  };
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_ROUNDS);
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
    issuer: 'swiftroute',
  } as SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    return jwt.verify(token, env.JWT_SECRET, { issuer: 'swiftroute' }) as AccessTokenPayload;
  } catch {
    throw unauthorized('Your session has expired. Please sign in again.');
  }
}

async function issueRefreshToken(userId: string, userAgent?: string): Promise<string> {
  const token = generateOpaqueToken();
  const days = parseDays(env.JWT_REFRESH_EXPIRES_IN);

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      userAgent: userAgent?.slice(0, 250) ?? null,
    },
  });

  return token;
}

function parseDays(spec: string): number {
  const match = /^(\d+)\s*([dhm])$/i.exec(spec.trim());
  if (!match) return 30;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === 'd') return value;
  if (unit === 'h') return value / 24;
  return value / (24 * 60);
}

async function buildAuthResult(userId: string, userAgent?: string): Promise<AuthResult> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { agentProfile: { select: AGENT_PROFILE_SELECT } },
  });

  const publicUser = toPublicUser(user);

  return {
    user: publicUser,
    accessToken: signAccessToken({
      sub: user.id,
      role: publicUser.role,
      name: user.fullName,
      email: user.email,
    }),
    refreshToken: await issueRefreshToken(user.id, userAgent),
    expiresIn: env.JWT_EXPIRES_IN,
  };
}

// ---------------------------------------------------------------------------
//  Public operations
// ---------------------------------------------------------------------------

export interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
  phone?: string | null;
  companyName?: string | null;
  /** Self-service signup is customer-only; admins create agents and admins. */
  role?: Role;
}

export async function register(input: RegisterInput, userAgent?: string): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw conflict('An account with that e-mail already exists. Try signing in instead.');
  }

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(input.password),
      fullName: input.fullName.trim(),
      phone: input.phone?.trim() || null,
      companyName: input.companyName?.trim() || null,
      role: input.role ?? 'CUSTOMER',
    },
  });

  await notifications.notifyWelcome({
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
  });

  return buildAuthResult(user.id, userAgent);
}

export async function login(
  email: string,
  password: string,
  userAgent?: string,
): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });

  // Same message and comparable timing whether the account exists or not, so
  // the endpoint cannot be used to enumerate registered e-mail addresses.
  const hash = user?.passwordHash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali';
  const ok = await bcrypt.compare(password, hash);

  if (!user || !ok) throw unauthorized('Incorrect e-mail or password.');
  if (!user.isActive) throw unauthorized('This account has been deactivated. Contact support.');

  return buildAuthResult(user.id, userAgent);
}

/** Rotate: the presented token is revoked and a brand new one is issued. */
export async function refresh(token: string, userAgent?: string): Promise<AuthResult> {
  if (!token) throw unauthorized('Missing refresh token.');

  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) } });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw unauthorized('Your session has expired. Please sign in again.');
  }

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  return buildAuthResult(stored.userId, userAgent);
}

export async function logout(token: string | undefined): Promise<void> {
  if (!token) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: sha256(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw badRequest('Your current password is incorrect.');
  }

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword) },
  });

  // Every other session dies with the old password.
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getProfile(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { agentProfile: { select: AGENT_PROFILE_SELECT } },
  });
  return toPublicUser(user);
}
