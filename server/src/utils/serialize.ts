/**
 * Helpers for the JSON-in-a-String columns (SQLite has no JSON type) and for
 * generating human-friendly identifiers.
 */
import crypto from 'node:crypto';

/** Stringify for storage; `undefined`/`null` collapse to null so the column stays clean. */
export function packJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

/** Parse a stored JSON string, never throwing. */
export function unpackJson<T = unknown>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * Crockford-style alphabet: no I, L, O, U — so a customer reading a tracking
 * code down the phone cannot confuse it with 1, 0 or the obvious profanity.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function randomToken(length: number): string {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/** Public tracking number, e.g. `SR-7K3M9QX2`. */
export function generateOrderCode(prefix = 'SR'): string {
  return `${prefix}-${randomToken(8)}`;
}

/** Opaque, URL-safe secret used for refresh tokens. */
export function generateOpaqueToken(bytes = 48): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}
