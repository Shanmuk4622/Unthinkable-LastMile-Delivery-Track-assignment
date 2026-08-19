/**
 * Environment configuration.
 *
 * Parsed once, validated with Zod, and exported as a frozen object. Nothing
 * else in the codebase reads `process.env` directly — that keeps defaults,
 * coercion and validation in a single auditable place, and makes it obvious
 * which knobs an operator can turn.
 */
import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env from the server folder first, then fall back to the repo root so a
// single top-level .env can drive the whole monorepo.
for (const candidate of [
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../../../.env'),
]) {
  if (fs.existsSync(candidate)) dotenv.config({ path: candidate });
}

const bool = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? fallback : /^(1|true|yes|on)$/i.test(v)));

const num = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? fallback : Number(v)))
    .pipe(z.number().finite());

const str = (fallback: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? fallback : v));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: num(4000),

  API_PUBLIC_URL: str('http://localhost:4000'),
  WEB_PUBLIC_URL: str('http://localhost:5173'),
  CORS_ORIGINS: str('http://localhost:5173,http://localhost:4173'),

  DATABASE_URL: str('file:./dev.db'),

  JWT_SECRET: str('swiftroute-dev-only-access-secret-change-me'),
  JWT_REFRESH_SECRET: str('swiftroute-dev-only-refresh-secret-change-me'),
  JWT_EXPIRES_IN: str('2h'),
  JWT_REFRESH_EXPIRES_IN: str('30d'),
  BCRYPT_ROUNDS: num(10),

  SEED_ADMIN_EMAIL: str('admin@swiftroute.dev'),
  SEED_ADMIN_PASSWORD: str('Admin@123'),
  SEED_DEMO_PASSWORD: str('Demo@123'),
  SEED_DEMO_ORDERS: bool(true),

  NOTIFY_EMAIL_PROVIDER: z.enum(['console', 'smtp']).default('console'),
  SMTP_HOST: str(''),
  SMTP_PORT: num(587),
  SMTP_SECURE: bool(false),
  SMTP_USER: str(''),
  SMTP_PASS: str(''),
  MAIL_FROM_NAME: str('SwiftRoute'),
  MAIL_FROM_ADDRESS: str('no-reply@swiftroute.dev'),

  NOTIFY_SMS_PROVIDER: z.enum(['console', 'twilio']).default('console'),
  TWILIO_ACCOUNT_SID: str(''),
  TWILIO_AUTH_TOKEN: str(''),
  TWILIO_FROM_NUMBER: str(''),

  ASSIGN_MAX_DISTANCE_KM: num(25),
  ASSIGN_WEIGHT_DISTANCE: num(0.5),
  ASSIGN_WEIGHT_ZONE_MATCH: num(0.25),
  ASSIGN_WEIGHT_WORKLOAD: num(0.15),
  ASSIGN_WEIGHT_PERFORMANCE: num(0.1),

  RATE_LIMIT_WINDOW_MS: num(15 * 60 * 1000),
  RATE_LIMIT_MAX: num(600),
  AUTH_RATE_LIMIT_MAX: num(40),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('\n  Invalid environment configuration:\n');
  for (const issue of parsed.error.issues) {
    // eslint-disable-next-line no-console
    console.error(`   - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const raw = parsed.data;

export const env = Object.freeze({
  ...raw,
  isProd: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  isDev: raw.NODE_ENV === 'development',
  corsOrigins: Array.from(
    new Set(
      [...raw.CORS_ORIGINS.split(','), raw.WEB_PUBLIC_URL]
        .map((o) => o.trim())
        .filter(Boolean),
    ),
  ),
  /** Weights normalised so they always sum to 1 regardless of what an operator typed. */
  assignmentWeights: (() => {
    const w = {
      distance: Math.max(0, raw.ASSIGN_WEIGHT_DISTANCE),
      zone: Math.max(0, raw.ASSIGN_WEIGHT_ZONE_MATCH),
      workload: Math.max(0, raw.ASSIGN_WEIGHT_WORKLOAD),
      performance: Math.max(0, raw.ASSIGN_WEIGHT_PERFORMANCE),
    };
    const total = w.distance + w.zone + w.workload + w.performance || 1;
    return Object.freeze({
      distance: w.distance / total,
      zone: w.zone / total,
      workload: w.workload / total,
      performance: w.performance / total,
    });
  })(),
});

export type Env = typeof env;
