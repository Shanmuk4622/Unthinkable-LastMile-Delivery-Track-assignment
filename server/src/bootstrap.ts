/**
 * Production entry point (`npm start` -> node dist/bootstrap.js).
 *
 * Free-tier hosts hand you an empty database and a single start command; there
 * is no release phase in which to run migrations. So the boot sequence does it
 * itself, and is safe to repeat on every restart:
 *
 *   1. push the Prisma schema (idempotent — a no-op once the tables exist)
 *   2. seed, but only when the database has never been seeded
 *   3. start the HTTP server
 *
 * Set BOOTSTRAP_DB=false to skip 1 and 2 when you manage migrations yourself.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { env } from './config/env';
import { logger } from './utils/logger';
import { startServer } from './server';

const SHOULD_BOOTSTRAP = process.env.BOOTSTRAP_DB !== 'false';

function pushSchema(): boolean {
  const serverDir = path.resolve(__dirname, '..');

  logger.info('Applying database schema…');

  const result = spawnSync(
    'node',
    [path.join(serverDir, 'scripts', 'prisma.mjs'), 'db', 'push', '--skip-generate', '--accept-data-loss'],
    { stdio: 'inherit', cwd: serverDir, env: process.env },
  );

  if (result.status !== 0) {
    logger.error('Schema push failed — starting anyway in case the schema is already current.');
    return false;
  }
  return true;
}

async function main(): Promise<void> {
  if (SHOULD_BOOTSTRAP) {
    pushSchema();

    try {
      const { isEmpty, seed, disconnect } = await import('./seed');
      if (await isEmpty()) {
        logger.info('Empty database detected — seeding demo data…');
        await seed();
      } else {
        logger.info('Database already populated — skipping seed.');
      }
      await disconnect();
    } catch (error) {
      // A seeding failure must never stop the API from coming up.
      logger.error('Seeding skipped after an error', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await startServer();
  logger.info(`SwiftRoute ready in ${env.NODE_ENV} mode.`);
}

void main();
