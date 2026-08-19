/**
 * Tiny structured logger. Colourised and human-readable in development,
 * single-line JSON in production so hosting platforms can index it.
 */
import { env } from '../config/env';

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL: Level = env.isTest ? 'error' : env.isProd ? 'info' : 'debug';

const COLOR: Record<Level, string> = {
  debug: '\x1b[90m',
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
};
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function write(level: Level, message: string, meta?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return;

  if (env.isProd) {
    // eslint-disable-next-line no-console
    console[level === 'debug' ? 'log' : level](
      JSON.stringify({ ts: new Date().toISOString(), level, message, ...meta }),
    );
    return;
  }

  const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
  const metaText =
    meta && Object.keys(meta).length ? ` \x1b[90m${JSON.stringify(meta)}${RESET}` : '';
  // eslint-disable-next-line no-console
  console[level === 'debug' ? 'log' : level](
    `${COLOR[level]}${BOLD}${level.toUpperCase().padEnd(5)}${RESET}${COLOR[level]}[${time}]${RESET} ${message}${metaText}`,
  );
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => write('debug', message, meta),
  info: (message: string, meta?: Record<string, unknown>) => write('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write('error', message, meta),
};
