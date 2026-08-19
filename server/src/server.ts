/**
 * HTTP server lifecycle: start, banner, graceful shutdown.
 */
import type { Server } from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './utils/logger';
import { disconnectPrisma, prisma } from './config/prisma';
import { describeTransports } from './services/notifications';

export async function startServer(): Promise<Server> {
  const app = createApp();

  const server = app.listen(env.PORT, () => {
    banner();
  });

  const shutdown = (signal: string) => async () => {
    logger.info(`${signal} received — shutting down gracefully.`);
    server.close(async () => {
      await disconnectPrisma();
      process.exit(0);
    });
    // Never hang a container on a stuck connection.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', shutdown('SIGTERM'));
  process.on('SIGINT', shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
  });

  return server;
}

function banner(): void {
  const transports = describeTransports();
  const dbKind = env.DATABASE_URL.startsWith('file:') ? 'SQLite' : 'PostgreSQL';

  const lines = [
    '',
    '  \x1b[35m⚡ SwiftRoute\x1b[0m \x1b[90m·\x1b[0m Last-Mile Delivery Tracker API',
    '  \x1b[90m─────────────────────────────────────────────\x1b[0m',
    `  \x1b[36mAPI\x1b[0m        http://localhost:${env.PORT}/api`,
    `  \x1b[36mHealth\x1b[0m     http://localhost:${env.PORT}/api/health`,
    `  \x1b[36mClient\x1b[0m     ${env.WEB_PUBLIC_URL}`,
    `  \x1b[36mDatabase\x1b[0m   ${dbKind}`,
    `  \x1b[36mE-mail\x1b[0m     ${transports.email.provider}${transports.email.live ? ' \x1b[32m(live)\x1b[0m' : ' \x1b[90m(outbox only)\x1b[0m'}`,
    `  \x1b[36mSMS\x1b[0m        ${transports.sms.provider}${transports.sms.live ? ' \x1b[32m(live)\x1b[0m' : ' \x1b[90m(outbox only)\x1b[0m'}`,
    `  \x1b[36mMode\x1b[0m       ${env.NODE_ENV}`,
    '',
  ];

  // eslint-disable-next-line no-console
  console.log(lines.join('\n'));
}

export { prisma };
