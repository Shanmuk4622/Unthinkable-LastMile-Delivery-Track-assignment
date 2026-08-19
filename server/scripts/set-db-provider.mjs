#!/usr/bin/env node
/**
 * set-db-provider.mjs
 * ---------------------------------------------------------------------------
 * Prisma cannot take its `datasource.provider` from an environment variable,
 * yet we want the exact same codebase to run on:
 *
 *   - SQLite      locally (`DATABASE_URL="file:./dev.db"`), so a reviewer can
 *                 clone the repo and be running in 60 seconds with no Docker,
 *   - PostgreSQL  in production (Render / Railway / Supabase / Neon).
 *
 * This script inspects DATABASE_URL and rewrites the single `provider = "..."`
 * line inside prisma/schema.prisma before `prisma generate` runs. It is wired
 * into every db:* npm script, so it is impossible to forget.
 *
 * It is deliberately dependency-free and idempotent.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(here, '..', 'prisma', 'schema.prisma');

// ---- load .env files without pulling in a dependency ---------------------
for (const candidate of [
  resolve(here, '..', '.env'),
  resolve(here, '..', '..', '.env'),
]) {
  if (!existsSync(candidate)) continue;
  for (const rawLine of readFileSync(candidate, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const url = process.env.DATABASE_URL ?? 'file:./dev.db';

/** @returns {'postgresql' | 'mysql' | 'sqlserver' | 'sqlite'} */
function providerFor(connectionString) {
  if (/^postgres(ql)?:\/\//i.test(connectionString)) return 'postgresql';
  if (/^mysql:\/\//i.test(connectionString)) return 'mysql';
  if (/^sqlserver:\/\//i.test(connectionString)) return 'sqlserver';
  return 'sqlite';
}

const provider = providerFor(url);

if (!existsSync(schemaPath)) {
  console.error(`[db-provider] schema not found at ${schemaPath}`);
  process.exit(1);
}

const schema = readFileSync(schemaPath, 'utf8');
const current = schema.match(/datasource\s+db\s*\{[^}]*?provider\s*=\s*"([^"]+)"/s)?.[1];

if (current === provider) {
  console.log(`[db-provider] already "${provider}" — nothing to do.`);
  process.exit(0);
}

const updated = schema.replace(
  /(datasource\s+db\s*\{[^}]*?provider\s*=\s*")[^"]+(")/s,
  `$1${provider}$2`,
);

if (updated === schema) {
  console.error('[db-provider] could not locate the datasource provider line.');
  process.exit(1);
}

writeFileSync(schemaPath, updated, 'utf8');
console.log(`[db-provider] provider "${current}" -> "${provider}" (from DATABASE_URL).`);
