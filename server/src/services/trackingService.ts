/**
 * Immutable tracking history.
 * ---------------------------------------------------------------------------
 * `TrackingEvent` is append-only by construction:
 *
 *   • this module exposes `append` and read helpers — there is no update or
 *     delete function anywhere in the codebase,
 *   • no route maps to a mutation of the table,
 *   • every row records WHO (actorId + actorRole + a denormalised actorName),
 *     WHAT (fromStatus -> toStatus), WHEN (createdAt) and WHY (notes/metadata).
 *
 * `actorName` is stored rather than joined on purpose. If an account is later
 * renamed or deleted the history must still read the way it read on the day —
 * that is the whole point of an audit log.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { ORDER_STATUS_META, type ActorRole, type OrderStatus } from '../domain/constants';
import { packJson } from '../utils/serialize';

export interface TrackingActor {
  id: string | null;
  role: ActorRole;
  name: string;
}

export interface AppendEventInput {
  orderId: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actor: TrackingActor;
  /** Overrides the default title derived from the status. */
  title?: string;
  notes?: string | null;
  lat?: number | null;
  lng?: number | null;
  metadata?: Record<string, unknown> | null;
}

/** Prisma client or an active transaction — lets callers stay atomic. */
type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Append one row. Always call this inside the same transaction as the status
 * update so a tracked order can never disagree with its own history.
 */
export async function append(input: AppendEventInput, db: Db = prisma) {
  return db.trackingEvent.create({
    data: {
      orderId: input.orderId,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      actorId: input.actor.id,
      actorRole: input.actor.role,
      actorName: input.actor.name,
      title: input.title ?? defaultTitle(input.toStatus, input.actor),
      notes: input.notes ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      metadata: packJson(input.metadata),
    },
  });
}

function defaultTitle(status: OrderStatus, actor: TrackingActor): string {
  const label = ORDER_STATUS_META[status].label;
  switch (actor.role) {
    case 'SYSTEM':
      return `${label} · automated`;
    case 'AGENT':
      return `${label} · updated by ${actor.name}`;
    case 'ADMIN':
      return `${label} · set by operations`;
    default:
      return label;
  }
}

/** Full chronological history for an order, oldest first. */
export async function historyFor(orderId: string) {
  return prisma.trackingEvent.findMany({
    where: { orderId },
    orderBy: { createdAt: 'asc' },
  });
}

/** Most recent activity across the network — powers the admin live feed. */
export async function recentActivity(limit = 25) {
  return prisma.trackingEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      order: {
        select: {
          id: true,
          code: true,
          status: true,
          customer: { select: { fullName: true } },
        },
      },
    },
  });
}
