/**
 * Dependency-free .env loader shared by the build scripts.
 *
 * SwiftRoute keeps ONE canonical `.env` at the repository root so that a
 * reviewer only ever edits a single file, but the Prisma CLI only looks in the
 * schema folder and the current working directory. These helpers bridge that
 * gap without pulling `dotenv-cli` into the dependency tree.
 *
 * Precedence (first hit wins, never overwrites an already-set variable):
 *   1. real process environment (CI / Render dashboard)
 *   2. server/.env
 *   3. <repo root>/.env
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export const SERVER_DIR = resolve(here, '..');
export const ROOT_DIR = resolve(here, '..', '..');

export function loadEnvFiles() {
  const loaded = [];
  for (const candidate of [resolve(SERVER_DIR, '.env'), resolve(ROOT_DIR, '.env')]) {
    if (!existsSync(candidate)) continue;
    loaded.push(candidate);
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
  if (process.env.DATABASE_URL === undefined) process.env.DATABASE_URL = 'file:./dev.db';
  return loaded;
}
