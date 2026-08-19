#!/usr/bin/env node
/**
 * prisma.mjs — the one entry point for every Prisma CLI invocation.
 *
 *   node scripts/prisma.mjs db push --skip-generate
 *   node scripts/prisma.mjs generate
 *   node scripts/prisma.mjs migrate deploy
 *
 * It performs two chores the CLI cannot do on its own:
 *   1. loads the repo-root `.env` (Prisma only reads the schema folder / cwd),
 *   2. syncs `datasource.provider` with DATABASE_URL.
 *
 * Then it hands over to the real CLI with the environment fully populated.
 */
import { spawnSync } from 'node:child_process';
import { loadEnvFiles, SERVER_DIR } from './load-env.mjs';
import { setDbProvider } from './set-db-provider.mjs';

const files = loadEnvFiles();
if (files.length) {
  console.log(`[env] loaded ${files.map((f) => f.replace(SERVER_DIR, '.')).join(', ')}`);
}

try {
  setDbProvider({ silent: true });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('usage: node scripts/prisma.mjs <prisma-cli-args...>');
  process.exit(1);
}

const result = spawnSync('npx', ['prisma', ...args], {
  stdio: 'inherit',
  cwd: SERVER_DIR,
  env: process.env,
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
