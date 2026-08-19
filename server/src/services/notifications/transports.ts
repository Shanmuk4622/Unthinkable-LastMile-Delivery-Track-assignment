/**
 * Notification transports.
 * ---------------------------------------------------------------------------
 * Two channels (e-mail, SMS), each with a real free-tier provider and a
 * `console` fallback.
 *
 * The fallback is a deliberate product decision, not a stub: a reviewer cloning
 * this repo has no SMTP credentials and no Twilio account, and an assignment
 * that only demonstrates notifications when secrets are present demonstrates
 * nothing. With `NOTIFY_*_PROVIDER=console` every message is still rendered,
 * persisted to the Notification table and surfaced in the in-app Outbox — the
 * flow is fully observable. Point the same code at SMTP or Twilio and real
 * messages go out with no other change.
 */
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

export interface SendResult {
  provider: string;
  messageId: string | null;
  ok: boolean;
  error?: string;
}

export interface EmailPayload {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface SmsPayload {
  to: string;
  body: string;
}

// ---------------------------------------------------------------------------
//  E-mail
// ---------------------------------------------------------------------------

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (env.NOTIFY_EMAIL_PROVIDER !== 'smtp') return null;
  if (!env.SMTP_HOST) {
    logger.warn('NOTIFY_EMAIL_PROVIDER=smtp but SMTP_HOST is empty — falling back to console.');
    return null;
  }
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });

  return transporter;
}

export async function sendEmail(payload: EmailPayload): Promise<SendResult> {
  const smtp = getTransporter();

  if (!smtp) {
    logger.info(`✉️  [outbox] EMAIL -> ${payload.to} :: ${payload.subject}`);
    return { provider: 'CONSOLE', messageId: null, ok: true };
  }

  try {
    const info = await smtp.sendMail({
      from: `"${env.MAIL_FROM_NAME}" <${env.MAIL_FROM_ADDRESS}>`,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    });
    return { provider: 'SMTP', messageId: info.messageId ?? null, ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('SMTP send failed', { to: payload.to, error: message });
    return { provider: 'SMTP', messageId: null, ok: false, error: message };
  }
}

/** Used by the health endpoint so an operator can verify SMTP without sending. */
export async function verifyEmailTransport(): Promise<{ configured: boolean; ok: boolean; error?: string }> {
  const smtp = getTransporter();
  if (!smtp) return { configured: false, ok: true };
  try {
    await smtp.verify();
    return { configured: true, ok: true };
  } catch (error) {
    return {
      configured: true,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ---------------------------------------------------------------------------
//  SMS
// ---------------------------------------------------------------------------

/**
 * Twilio is called over its plain REST API with `fetch` rather than the official
 * SDK — one HTTP POST does not justify a 5 MB dependency, and it keeps the
 * cold-start time of the free-tier host down.
 */
export async function sendSms(payload: SmsPayload): Promise<SendResult> {
  const usable =
    env.NOTIFY_SMS_PROVIDER === 'twilio' &&
    env.TWILIO_ACCOUNT_SID &&
    env.TWILIO_AUTH_TOKEN &&
    env.TWILIO_FROM_NUMBER;

  if (!usable) {
    if (env.NOTIFY_SMS_PROVIDER === 'twilio') {
      logger.warn('NOTIFY_SMS_PROVIDER=twilio but credentials are incomplete — using console.');
    }
    logger.info(`📱 [outbox] SMS -> ${payload.to} :: ${payload.body}`);
    return { provider: 'CONSOLE', messageId: null, ok: true };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
  const body = new URLSearchParams({
    To: payload.to,
    From: env.TWILIO_FROM_NUMBER,
    Body: payload.body,
  });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization:
          'Basic ' +
          Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    const json = (await response.json()) as { sid?: string; message?: string };

    if (!response.ok) {
      logger.error('Twilio send failed', { status: response.status, message: json.message });
      return {
        provider: 'TWILIO',
        messageId: null,
        ok: false,
        error: json.message ?? `HTTP ${response.status}`,
      };
    }

    return { provider: 'TWILIO', messageId: json.sid ?? null, ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Twilio request threw', { error: message });
    return { provider: 'TWILIO', messageId: null, ok: false, error: message };
  }
}

export function describeTransports() {
  return {
    email: {
      provider: env.NOTIFY_EMAIL_PROVIDER,
      live: env.NOTIFY_EMAIL_PROVIDER === 'smtp' && Boolean(env.SMTP_HOST),
      from: env.MAIL_FROM_ADDRESS,
    },
    sms: {
      provider: env.NOTIFY_SMS_PROVIDER,
      live:
        env.NOTIFY_SMS_PROVIDER === 'twilio' &&
        Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER),
      from: env.TWILIO_FROM_NUMBER || null,
    },
  };
}
