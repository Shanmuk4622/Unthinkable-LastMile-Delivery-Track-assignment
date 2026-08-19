/**
 * Prisma client singleton.
 *
 * `tsx watch` reloads the module graph on every save; without caching the
 * client on `globalThis` we would leak a connection pool per reload.
 */
import { PrismaClient } from '@prisma/client';
import { env } from './env';

const globalForPrisma = globalThis as unknown as { __swiftroutePrisma?: PrismaClient };

export const prisma =
  globalForPrisma.__swiftroutePrisma ??
  new PrismaClient({
    log: env.isDev ? ['warn', 'error'] : ['error'],
  });

if (!env.isProd) globalForPrisma.__swiftroutePrisma = prisma;

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
