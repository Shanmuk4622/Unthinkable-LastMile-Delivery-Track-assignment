/**
 * Development entry point (`npm run dev` -> tsx watch src/index.ts).
 *
 * The production entry point is `src/bootstrap.ts`, which additionally applies
 * the schema and seeds an empty database before starting — see that file.
 */
import { startServer } from './server';

void startServer();
