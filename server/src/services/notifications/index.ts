/**
 * Notification service — a transactional outbox.
 * ---------------------------------------------------------------------------
 * Every lifecycle event writes its message rows to the database *first*, then
 * dispatches them. Two properties fall out of that ordering:
 *
 *   • Nothing is lost. If SMTP is down the row survives with status FAILED and
 *     the exact provider error, ready to be retried.
 *   • Nothing blocks. Dispatch is fire-and-forget from the caller's point of
 *     view, so a slow mail server can never make `PATCH /orders/:id/status`
 *     time out — the status change is already committed.
 *
 * Delivery is at-least-once and best-effort, which is the right trade for
 * customer notifications: a duplicate "out for delivery" text is a nuisance, a
 * missing one is a support ticket.
 */
import type { Order } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { logger } from '../../utils/logger';
import type { OrderStatus } from '../../domain/constants';
import { sendEmail, sendSms } from './transports';
import {
  agentAssignedTemplate,
  deliveryFailedTemplate,
  orderCreatedTemplate,
  rescheduledTemplate,
  statusChangedTemplate,
  welcomeTemplate,
  type OrderSummary,
  type RenderedMessage,
} from './templates';

export * from './templates';
export { describeTransports, verifyEmailTransport } from './transports';

interface Recipient {
  userId: string | null;
  email: string | null;
  phone: string | null;
  name: string;
}

/**
 * Persist then dispatch. Returns immediately after the rows are committed;
 * the actual provider calls run on the next tick.
 */
async function queue(params: {
  message: RenderedMessage;
  recipient: Recipient;
  orderId?: string | null;
  /** SMS is opt-in per event — we do not text customers about every micro-step. */
  includeSms?: boolean;
}): Promise<void> {
  const { message, recipient, orderId = null, includeSms = false } = params;

  const rows: string[] = [];

  if (recipient.email) {
    const row = await prisma.notification.create({
      data: {
        orderId,
        userId: recipient.userId,
        channel: 'EMAIL',
        recipient: recipient.email,
        subject: message.subject,
        body: message.text,
        html: message.html,
        status: 'QUEUED',
      },
    });
    rows.push(row.id);
  }

  if (includeSms && recipient.phone) {
    const row = await prisma.notification.create({
      data: {
        orderId,
        userId: recipient.userId,
        channel: 'SMS',
        recipient: recipient.phone,
        body: message.sms,
        status: 'QUEUED',
      },
    });
    rows.push(row.id);
  }

  // Dispatch out of band — never make the caller wait on a mail server.
  void Promise.resolve().then(() => flush(rows));
}

/** Attempt delivery for the given queued notification ids. */
export async function flush(ids: string[]): Promise<void> {
  for (const id of ids) {
    const row = await prisma.notification.findUnique({ where: { id } });
    if (!row || row.status === 'SENT') continue;

    const result =
      row.channel === 'EMAIL'
        ? await sendEmail({
            to: row.recipient,
            subject: row.subject ?? 'SwiftRoute update',
            text: row.body,
            html: row.html ?? `<pre>${row.body}</pre>`,
          })
        : await sendSms({ to: row.recipient, body: row.body });

    await prisma.notification.update({
      where: { id },
      data: {
        status: result.ok ? 'SENT' : 'FAILED',
        provider: result.provider,
        providerMessageId: result.messageId,
        error: result.error ?? null,
        attempts: { increment: 1 },
        sentAt: result.ok ? new Date() : null,
      },
    });
  }
}

/** Retry every FAILED notification. Exposed to admins as a one-click action. */
export async function retryFailed(limit = 50): Promise<number> {
  const failed = await prisma.notification.findMany({
    where: { status: 'FAILED' },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { id: true },
  });
  await flush(failed.map((f) => f.id));
  return failed.length;
}

// ---------------------------------------------------------------------------
//  Event helpers — the only functions the rest of the codebase calls
// ---------------------------------------------------------------------------

type OrderForNotification = Order & {
  customer: { id: string; fullName: string; email: string; phone: string | null };
  pickupAddress: { city: string };
  dropAddress: { city: string };
  agent?: { user: { fullName: string; phone: string | null } } | null;
};

function summarise(order: OrderForNotification): OrderSummary {
  return {
    code: order.code,
    customerName: order.customer.fullName,
    status: order.status as OrderStatus,
    totalCharge: order.totalCharge,
    currency: order.currency,
    pickupCity: order.pickupAddress.city,
    dropCity: order.dropAddress.city,
    agentName: order.agent?.user.fullName ?? null,
    agentPhone: order.agent?.user.phone ?? null,
    scheduledDate: order.scheduledDate,
    failureReason: order.failureReason,
  };
}

function recipientOf(order: OrderForNotification): Recipient {
  return {
    userId: order.customer.id,
    email: order.customer.email,
    phone: order.customer.phone,
    name: order.customer.fullName,
  };
}

export async function notifyOrderCreated(order: OrderForNotification): Promise<void> {
  await queue({
    message: orderCreatedTemplate(summarise(order)),
    recipient: recipientOf(order),
    orderId: order.id,
    includeSms: true,
  });
}

/**
 * The workhorse: called for *every* status transition, exactly as the brief
 * requires. Failure and reschedule get their own richer templates; SMS is
 * reserved for the moments a customer actually needs to act on.
 */
export async function notifyStatusChange(
  order: OrderForNotification,
  from: OrderStatus | null,
): Promise<void> {
  const summary = summarise(order);
  const status = order.status as OrderStatus;

  const message =
    status === 'FAILED'
      ? deliveryFailedTemplate(summary)
      : status === 'RESCHEDULED'
        ? rescheduledTemplate(summary)
        : status === 'ASSIGNED'
          ? agentAssignedTemplate(summary)
          : statusChangedTemplate(summary, from);

  const smsWorthy: OrderStatus[] = [
    'ASSIGNED',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'FAILED',
    'RESCHEDULED',
    'CANCELLED',
  ];

  await queue({
    message,
    recipient: recipientOf(order),
    orderId: order.id,
    includeSms: smsWorthy.includes(status),
  });

  logger.debug('notification queued', { order: order.code, from, to: status });
}

export async function notifyWelcome(user: {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
}): Promise<void> {
  await queue({
    message: welcomeTemplate(user.fullName),
    recipient: { userId: user.id, email: user.email, phone: user.phone, name: user.fullName },
  });
}
