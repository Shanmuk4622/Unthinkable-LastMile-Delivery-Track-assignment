/**
 * Express application.
 *
 * Exported without calling `listen` so the integration tests can drive it with
 * supertest in-process, and so the production entry point stays a three-liner.
 *
 * In production the same process also serves the built React client, which
 * means the whole product deploys as ONE service on a free tier — no CORS, no
 * second cold start, no split URL to explain to a reviewer.
 */
import path from 'node:path';
import fs from 'node:fs';
import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { logger } from './utils/logger';
import { apiRouter } from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

export function createApp(): Express {
  const app = express();

  // Render / Railway / Vercel put us behind a proxy; without this the rate
  // limiter would bucket the whole world into one IP.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // The SPA is served from this same origin and uses inline styles; a
      // strict CSP here would break it without adding protection the API needs.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin requests, curl and server-to-server calls send no Origin.
        if (!origin) return callback(null, true);
        if (env.corsOrigins.includes(origin)) return callback(null, true);
        // Any Vercel preview deployment of this project.
        if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) return callback(null, true);
        return callback(new Error(`Origin ${origin} is not allowed by CORS.`));
      },
      credentials: true,
    }),
  );

  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  if (!env.isTest) {
    app.use(
      morgan(env.isProd ? 'combined' : 'dev', {
        skip: (req) => req.path === '/api/health',
        stream: { write: (line) => logger.debug(line.trim()) },
      }),
    );
  }

  app.use(
    '/api',
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => req.path === '/health',
      message: {
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' },
      },
    }),
  );

  app.use('/api', apiRouter);

  // ---- static client ----------------------------------------------------
  const clientDir = path.resolve(__dirname, '../public');

  if (fs.existsSync(path.join(clientDir, 'index.html'))) {
    app.use(
      express.static(clientDir, {
        // Vite fingerprints its assets, so they can be cached hard; index.html
        // must not be, or a deploy would never reach a returning visitor.
        setHeaders(res, filePath) {
          if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
          else res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        },
      }),
    );

    // SPA fallback — anything that is not an API route renders the client.
    app.get(/^\/(?!api).*/, (_req, res) => {
      res.sendFile(path.join(clientDir, 'index.html'));
    });
  } else {
    app.get('/', (_req, res) => {
      res.json({
        success: true,
        data: {
          service: 'SwiftRoute API',
          message: 'The React client is not built into this deployment.',
          docs: '/api/meta',
          health: '/api/health',
        },
      });
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
