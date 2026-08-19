/**
 * `npm run db:seed` / `prisma db seed` entry point.
 *
 * The seeding logic itself lives in src/seed so that it is compiled into dist/
 * and can be reused by the production boot sequence (src/bootstrap.ts), which
 * seeds a freshly provisioned database on first start.
 */
import { seed, disconnect } from '../src/seed';

seed()
  .then(disconnect)
  .catch(async (error) => {
    console.error('\n  Seeding failed:\n', error);
    await disconnect();
    process.exit(1);
  });
