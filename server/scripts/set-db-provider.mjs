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
 * This module inspects DATABASE_URL and rewrites the single `provider = "..."`
 * line inside prisma/schema.prisma. It is wired into every db:* npm script via
 * scripts/prisma.mjs, so it is impossible to forget. Idempotent and
 * dependency-free.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFiles, SERVER_DIR } from './load-env.mjs';

const SCHEMA_PATH = resolve(SERVER_DIR, 'prisma', 'schema.prisma');

/** @returns {'postgresql' | 'mysql' | 'sqlserver' | 'sqlite'} */
export function providerFor(connectionString) {
  if (/^postgres(ql)?:\/\//i.test(connectionString)) return 'postgresql';
  if (/^mysql:\/\//i.test(connectionString)) return 'mysql';
  if (/^sqlserver:\/\//i.test(connectionString)) return 'sqlserver';
  return 'sqlite';
}

export function setDbProvider({ silent = false } = {}) {
  const url = process.env.DATABASE_URL ?? 'file:./dev.db';
  const provider = providerFor(url);

  if (!existsSync(SCHEMA_PATH)) {
    throw new Error(`[db-provider] schema not found at ${SCHEMA_PATH}`);
  }

  const schema = readFileSync(SCHEMA_PATH, 'utf8');
  const current = schema.match(/datasource\s+db\s*\{[^}]*?provider\s*=\s*"([^"]+)"/s)?.[1];

  if (current === provider) {
    if (!silent) console.log(`[db-provider] already "${provider}" — nothing to do.`);
    return provider;
  }

  const updated = schema.replace(
    /(datasource\s+db\s*\{[^}]*?provider\s*=\s*")[^"]+(")/s,
    `$1${provider}$2`,
  );

  if (updated === schema) {
    throw new Error('[db-provider] could not locate the datasource provider line.');
  }

  writeFileSync(SCHEMA_PATH, updated, 'utf8');
  if (!silent) console.log(`[db-provider] provider "${current}" -> "${provider}" (from DATABASE_URL).`);
  return provider;
}

// Allow `node scripts/set-db-provider.mjs` to be run on its own.
if (process.argv[1] && process.argv[1].endsWith('set-db-provider.mjs')) {
  loadEnvFiles();
  try {
    setDbProvider();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
