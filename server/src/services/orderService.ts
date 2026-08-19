/**
 * ════════════════════════════════════════════════════════════════════════════
 *  ORDER SERVICE — the transactional core
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Every write path in the application lives here so that four things which
 *  must happen together never drift apart:
 *
 *      1. the order row moves to its new status
 *      2. a TrackingEvent is appended (immutably)
 *      3. agent capacity accounting is adjusted
 *      4. the customer is notified
 *
 *  (1) - (3) run inside a single database transaction. (4) is deliberately
 *  outside it: a mail server must never be able to roll back a delivery.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { logger } from '../utils/logger';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors';
import { generateOrderCode, packJson } from '../utils/serialize';
import { round2 } from '../utils/money';
import {
  ACTIVE_STATUSES,
  type ActorRole,
  type OrderStatus,
  type OrderType,
  type PaymentType,
  type Role,
} from '../domain/constants';
import { assertTransition, occupiesAgentCapacity } from '../domain/orderStateMachine';
import { calculateQuote, type Quote } from './rateEngine';
import { detectZoneByPincode } from './zoneService';
import { rankAgents, type AssignmentDecision, type ScoredCandidate } from './assignmentEngine';
import * as tracking from './trackingService';
import * as notifications from './notifications';

// ---------------------------------------------------------------------------
//  Shared query shapes
// ---------------------------------------------------------------------------

/** Everything the API and the notification templates need in one round trip. */
export const ORDER_INCLUDE = {
  customer: { select: { id: true, fullName: true, email: true, phone: true, companyName: true } },
  createdBy: { select: { id: true, fullName: true, role: true } },
  pickupAddress: true,
  dropAddress: true,
  pickupZone: { select: { id: true, code: true, name: true, city: true } },
  dropZone: { select: { id: true, code: true, name: true, city: true } },
  rateCard: { select: { id: true, name: true, orderType: true, scope: true } },
  agent: {
    select: {
      id: true,
      vehicleType: true,
      vehicleNumber: true,
      availability: true,
      currentLat: true,
      currentLng: true,
      user: { select: { id: true, fullName: true, email: true, phone: true } },
      zone: { select: { id: true, code: true, name: true } },
    },
  },
} satisfies Prisma.OrderInclude;

export interface Actor {
  id: string;
  role: Role;
  name: string;
}

export interface AddressInput {
  contactName: string;
  contactPhone: string;
  line1: string;
  line2?: string | null;
  landmark?: string | null;
  city: string;
  state?: string | null;
  pincode: string;
  lat?: number | null;
  lng?: number | null;
  label?: string | null;
}

export interface CreateOrderInput {
  customerId: string;
  orderType: OrderType;
  paymentType: PaymentType;
  declaredValue?: number;
  pickup: AddressInput;
  drop: AddressInput;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
  actualWeightKg: number;
  scheduledDate?: string | Date | null;
  notes?: string | null;
  /** Book straight into CONFIRMED — used when the customer accepted the quote. */
  confirmImmediately?: boolean;
  /** Run the dispatcher as soon as the order is confirmed. */
  autoAssign?: boolean;
}

// ---------------------------------------------------------------------------
//  Creation
// ---------------------------------------------------------------------------

/**
 * Create an order.
 *
 * The quote is recomputed server-side here even though the client already saw
 * one: a price shown in a browser is a *display*, never an input. The recomputed
 * breakdown is then frozen onto the row, so editing a rate card tomorrow cannot
 * silently restate yesterday's invoice.
 */
export async function createOrder(input: CreateOrderInput, actor: Actor) {
  const customer = await prisma.user.findUnique({ where: { id: input.customerId } });
  if (!customer) throw notFound('Customer');
  if (customer.role !== 'CUSTOMER' && actor.role !== 'ADMIN') {
    throw badRequest('Orders can only be placed against a customer account.');
  }

  const quote = await calculateQuote({
    pickupPincode: input.pickup.pincode,
    dropPincode: input.drop.pincode,
    lengthCm: input.lengthCm,
    breadthCm: input.breadthCm,
    heightCm: input.heightCm,
    actualWeightKg: input.actualWeightKg,
    orderType: input.orderType,
    paymentType: input.paymentType,
    declaredValue: input.declaredValue ?? 0,
  });

  // Resolve coordinates for both legs, falling back to the area centroid.
  const [pickupZone, dropZone] = await Promise.all([
    detectZoneByPincode(input.pickup.pincode),
    detectZoneByPincode(input.drop.pincode),
  ]);

  const status: OrderStatus = input.confirmImmediately ? 'CONFIRMED' : 'PENDING';

  const order = await prisma.$transaction(async (tx) => {
    const pickupAddress = await tx.address.create({
      data: snapshotAddress(input.pickup, pickupZone.lat, pickupZone.lng),
    });
    const dropAddress = await tx.address.create({
      data: snapshotAddress(input.drop, dropZone.lat, dropZone.lng),
    });

    const created = await tx.order.create({
      data: {
        code: generateOrderCode(),
        customerId: customer.id,
        createdById: actor.id,
        orderType: input.orderType,
        paymentType: input.paymentType,
        declaredValue: round2(input.declaredValue ?? 0),

        pickupAddressId: pickupAddress.id,
        dropAddressId: dropAddress.id,
        pickupZoneId: quote.zones.pickup.id,
        dropZoneId: quote.zones.drop.id,

        lengthCm: input.lengthCm,
        breadthCm: input.breadthCm,
        heightCm: input.heightCm,
        actualWeightKg: input.actualWeightKg,
        volumetricWeightKg: quote.weights.volumetricKg,
        chargeableWeightKg: quote.weights.chargeableKg,

        rateCardId: quote.rateCard.id,
        baseCharge: quote.charges.baseCharge,
        weightCharge: quote.charges.weightCharge,
        handlingFee: quote.charges.handlingFee,
        fuelSurcharge: quote.charges.fuelSurcharge,
        codSurcharge: quote.charges.codSurcharge,
        taxAmount: quote.charges.taxAmount,
        totalCharge: quote.charges.total,
        currency: quote.currency,
        pricingBreakdown: packJson(quote),

        status,
        scheduledDate: input.scheduledDate ? new Date(input.scheduledDate) : null,
        notes: input.notes ?? null,
      },
      include: ORDER_INCLUDE,
    });

    await tracking.append(
      {
        orderId: created.id,
        fromStatus: null,
        toStatus: status,
        actor: toTrackingActor(actor),
        title:
          actor.role === 'ADMIN' && actor.id !== customer.id
            ? `Order created by operations on behalf of ${customer.fullName}`
            : 'Order placed',
        notes: `${quote.zones.pickup.name} → ${quote.zones.drop.name} · ${quote.weights.chargeableKg} kg chargeable · ${quote.currency} ${quote.charges.total}`,
        metadata: {
          scope: quote.zones.scope,
          billedOn: quote.weights.billedOn,
          rateCard: quote.rateCard.name,
          total: quote.charges.total,
        },
      },
      tx,
    );

    return created;
  });

  logger.info('order created', { code: order.code, status, total: order.totalCharge });

  await notifications.notifyOrderCreated(order);

  if (input.confirmImmediately && input.autoAssign) {
    try {
      return await autoAssign(order.id, actor);
    } catch (error) {
      // A dispatcher miss must not fail the booking — the order simply waits
      // in CONFIRMED for a manual assignment.
      logger.warn('auto-assign after creation found no agent', {
        code: order.code,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return order;
}

function snapshotAddress(
  input: AddressInput,
  fallbackLat: number | null,
  fallbackLng: number | null,
): Prisma.AddressCreateInput {
  return {
    label: input.label ?? null,
    contactName: input.contactName,
    contactPhone: input.contactPhone,
    line1: input.line1,
    line2: input.line2 ?? null,
    landmark: input.landmark ?? null,
    city: input.city,
    state: input.state ?? null,
    pincode: input.pincode.replace(/\D/g, ''),
    lat: input.lat ?? fallbackLat,
    lng: input.lng ?? fallbackLng,
    isSaved: false,
  };
}

// ---------------------------------------------------------------------------
//  Status transitions
// ---------------------------------------------------------------------------

export interface ChangeStatusOptions {
  notes?: string | null;
  failureReason?: string | null;
  lat?: number | null;
  lng?: number | null;
  /** Admin-only: bypass the transition graph. Recorded on the event. */
  override?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * The single funnel for every status change in the system.
 */
export async function changeStatus(
  orderId: string,
  to: OrderStatus,
  actor: Actor,
  options: ChangeStatusOptions = {},
) {
  const existing = await prisma.order.findUnique({
    where: { id: orderId },
    include: ORDER_INCLUDE,
  });
  if (!existing) throw notFound('Order');

  const from = existing.status as OrderStatus;
  const isOverride = Boolean(options.override) && actor.role === 'ADMIN';

  assertTransition(from, to, isOverride);

  if (to === 'FAILED' && !options.failureReason) {
    throw badRequest('A failure reason is required when marking a delivery as failed.');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const now = new Date();

    const data: Prisma.OrderUpdateInput = { status: to };

    if (to === 'PICKED_UP') data.pickedUpAt = now;
    if (to === 'DELIVERED') data.deliveredAt = now;
    if (to === 'FAILED') {
      data.failedAt = now;
      data.failureReason = options.failureReason ?? null;
      data.attemptCount = { increment: 1 };
    }
    if (to === 'CANCELLED') data.cancelReason = options.notes ?? null;

    // ---- agent capacity accounting -------------------------------------
    const wasActive = occupiesAgentCapacity(from);
    const willBeActive = occupiesAgentCapacity(to);

    if (existing.agentId && wasActive && !willBeActive) {
      await releaseAgent(tx, existing.agentId, to);
    }
    if (existing.agentId && !wasActive && willBeActive) {
      await occupyAgent(tx, existing.agentId);
    }

    // A failed or rescheduled order leaves its agent — the next attempt is
    // dispatched fresh, which is what the brief asks for.
    if (to === 'FAILED' || to === 'RESCHEDULED') {
      data.agent = { disconnect: true };
      if (existing.agentId) {
        await tx.assignmentHistory.updateMany({
          where: { orderId: existing.id, agentId: existing.agentId, unassignedAt: null },
          data: { unassignedAt: now },
        });
      }
    }

    const result = await tx.order.update({
      where: { id: orderId },
      data,
      include: ORDER_INCLUDE,
    });

    await tracking.append(
      {
        orderId,
        fromStatus: from,
        toStatus: to,
        actor: toTrackingActor(actor),
        title: isOverride ? `Status overridden to ${to} by operations` : undefined,
        notes: options.failureReason ?? options.notes ?? null,
        lat: options.lat ?? null,
        lng: options.lng ?? null,
        metadata: {
          ...(options.metadata ?? {}),
          ...(isOverride ? { override: true, bypassedTransition: `${from} -> ${to}` } : {}),
        },
      },
      tx,
    );

    return result;
  });

  logger.info('order status changed', { code: updated.code, from, to, by: actor.role });

  await notifications.notifyStatusChange(updated, from);

  return updated;
}

async function occupyAgent(tx: Prisma.TransactionClient, agentId: string) {
  const agent = await tx.agentProfile.update({
    where: { id: agentId },
    data: { activeOrderCount: { increment: 1 }, totalAssigned: { increment: 1 } },
  });
  // Flip to BUSY the moment the agent is full, so the dispatcher stops
  // considering them without anyone having to remember to toggle a switch.
  if (agent.activeOrderCount >= agent.maxConcurrentOrders && agent.availability === 'AVAILABLE') {
    await tx.agentProfile.update({ where: { id: agentId }, data: { availability: 'BUSY' } });
  }
}

async function releaseAgent(
  tx: Prisma.TransactionClient,
  agentId: string,
  outcome: OrderStatus,
) {
  const agent = await tx.agentProfile.findUnique({ where: { id: agentId } });
  if (!agent) return;

  const nextActive = Math.max(0, agent.activeOrderCount - 1);

  await tx.agentProfile.update({
    where: { id: agentId },
    data: {
      activeOrderCount: nextActive,
      ...(outcome === 'DELIVERED' ? { totalDelivered: { increment: 1 } } : {}),
      ...(outcome === 'FAILED' ? { totalFailed: { increment: 1 } } : {}),
      // Freeing up a slot makes a BUSY agent dispatchable again.
      ...(agent.availability === 'BUSY' && nextActive < agent.maxConcurrentOrders
        ? { availability: 'AVAILABLE' }
        : {}),
    },
  });
}

// ---------------------------------------------------------------------------
//  Assignment
// ---------------------------------------------------------------------------

/** Shared by both assignment paths. */
async function attachAgent(params: {
  orderId: string;
  agentId: string;
  actor: Actor;
  mode: 'AUTO' | 'MANUAL' | 'REASSIGN';
  reason: string;
  distanceKm?: number | null;
  score?: number | null;
  shortlist?: ScoredCandidate[] | null;
}) {
  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
    include: ORDER_INCLUDE,
  });
  if (!order) throw notFound('Order');

  const from = order.status as OrderStatus;
  if (!['CONFIRMED', 'ASSIGNED', 'RESCHEDULED', 'FAILED'].includes(from)) {
    throw conflict(
      `An order in status ${from} cannot be assigned. Confirm it first, or reschedule a failed delivery.`,
    );
  }

  const agent = await prisma.agentProfile.findUnique({
    where: { id: params.agentId },
    include: { user: { select: { fullName: true, isActive: true } } },
  });
  if (!agent) throw notFound('Delivery agent');
  if (!agent.user.isActive) throw badRequest('That agent account is deactivated.');

  const previousAgentId = order.agentId;

  const updated = await prisma.$transaction(async (tx) => {
    const now = new Date();

    if (previousAgentId && previousAgentId !== params.agentId) {
      await releaseAgent(tx, previousAgentId, 'RESCHEDULED');
      await tx.assignmentHistory.updateMany({
        where: { orderId: order.id, agentId: previousAgentId, unassignedAt: null },
        data: { unassignedAt: now },
      });
    }

    if (previousAgentId !== params.agentId) {
      await occupyAgent(tx, params.agentId);
    }

    const result = await tx.order.update({
      where: { id: order.id },
      data: { agentId: params.agentId, status: 'ASSIGNED' },
      include: ORDER_INCLUDE,
    });

    await tx.assignmentHistory.create({
      data: {
        orderId: order.id,
        agentId: params.agentId,
        assignedById: params.actor.id,
        mode: params.mode,
        reason: params.reason,
        distanceKm: params.distanceKm ?? null,
        score: params.score ?? null,
        candidateSnapshot: packJson(params.shortlist?.slice(0, 6) ?? null),
      },
    });

    await tracking.append(
      {
        orderId: order.id,
        fromStatus: from,
        toStatus: 'ASSIGNED',
        actor:
          params.mode === 'AUTO'
            ? { id: null, role: 'SYSTEM', name: 'Dispatch engine' }
            : toTrackingActor(params.actor),
        title:
          params.mode === 'AUTO'
            ? `Auto-assigned to ${agent.user.fullName}`
            : `${previousAgentId ? 'Re-assigned' : 'Assigned'} to ${agent.user.fullName}`,
        notes: params.reason,
        metadata: {
          mode: params.mode,
          agentId: params.agentId,
          agentName: agent.user.fullName,
          previousAgentId,
          distanceKm: params.distanceKm ?? null,
          score: params.score ?? null,
        },
      },
      tx,
    );

    return result;
  });

  logger.info('order assigned', {
    code: updated.code,
    agent: agent.user.fullName,
    mode: params.mode,
  });

  await notifications.notifyStatusChange(updated, from);

  return updated;
}

/** Admin picks a specific agent. */
export async function assignManually(
  orderId: string,
  agentId: string,
  actor: Actor,
  reason?: string,
) {
  return attachAgent({
    orderId,
    agentId,
    actor,
    mode: 'MANUAL',
    reason: reason ?? `Manually assigned by ${actor.name}`,
  });
}

/**
 * Run the dispatcher and act on its top-ranked candidate.
 * @throws conflict(409) when no agent is eligible — the caller decides whether
 *         that is fatal (an explicit admin click) or tolerable (booking flow).
 */
export async function autoAssign(orderId: string, actor: Actor, excludeAgentId?: string | null) {
  const decision = await previewAssignment(orderId, excludeAgentId);

  if (!decision.chosen) {
    throw conflict(decision.reason, { rejected: decision.rejected.slice(0, 8) });
  }

  return attachAgent({
    orderId,
    agentId: decision.chosen.agentId,
    actor,
    mode: excludeAgentId ? 'REASSIGN' : 'AUTO',
    reason: decision.reason,
    distanceKm: decision.chosen.distanceKm,
    score: decision.chosen.score,
    shortlist: decision.ranked,
  });
}

/** Score agents for an order without changing anything (admin "who would get this?"). */
export async function previewAssignment(
  orderId: string,
  excludeAgentId?: string | null,
): Promise<AssignmentDecision> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { pickupAddress: true },
  });
  if (!order) throw notFound('Order');

  return rankAgents({
    pickupZoneId: order.pickupZoneId,
    dropZoneId: order.dropZoneId,
    pickupPosition:
      order.pickupAddress.lat !== null && order.pickupAddress.lng !== null
        ? { lat: order.pickupAddress.lat, lng: order.pickupAddress.lng }
        : null,
    chargeableWeightKg: order.chargeableWeightKg,
    excludeAgentId: excludeAgentId ?? null,
  });
}

// ---------------------------------------------------------------------------
//  Failed-delivery / reschedule flow
// ---------------------------------------------------------------------------

/**
 * The failure loop required by the brief:
 *
 *   agent marks FAILED
 *        └─ order flagged, attemptCount++, agent released and detached
 *        └─ customer notified with a reschedule call to action
 *   customer picks a new date  ->  RESCHEDULED
 *        └─ RescheduleRequest captured (who, when, why, which attempt)
 *        └─ dispatcher runs again, EXCLUDING the agent who just failed
 *        └─ order returns to ASSIGNED with a fresh agent
 */
export async function reschedule(
  orderId: string,
  params: { newDate: string | Date; reason?: string | null },
  actor: Actor,
) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw notFound('Order');

  if (order.status !== 'FAILED') {
    throw conflict(
      `Only a failed delivery can be rescheduled. This order is ${order.status}.`,
    );
  }

  const newDate = new Date(params.newDate);
  if (Number.isNaN(newDate.getTime())) throw badRequest('The new delivery date is not a valid date.');

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  if (newDate < startOfToday) throw badRequest('The new delivery date cannot be in the past.');

  // The agent whose attempt failed — excluded from the next dispatch round.
  const lastAttempt = await prisma.assignmentHistory.findFirst({
    where: { orderId },
    orderBy: { createdAt: 'desc' },
  });

  await prisma.rescheduleRequest.create({
    data: {
      orderId,
      requestedById: actor.id,
      previousDate: order.scheduledDate,
      newDate,
      reason: params.reason ?? null,
      attemptNumber: order.attemptCount + 1,
    },
  });

  await prisma.order.update({ where: { id: orderId }, data: { scheduledDate: newDate } });

  const rescheduled = await changeStatus(orderId, 'RESCHEDULED', actor, {
    notes:
      params.reason ??
      `Rescheduled for ${newDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`,
    metadata: { newDate: newDate.toISOString(), attemptNumber: order.attemptCount + 1 },
  });

  // Re-dispatch. A failure to find anyone leaves the order in RESCHEDULED for
  // an admin to handle manually rather than blowing up the customer's request.
  try {
    return await autoAssign(orderId, { id: actor.id, role: actor.role, name: actor.name }, lastAttempt?.agentId ?? null);
  } catch (error) {
    logger.warn('re-assignment after reschedule found no agent', {
      code: rescheduled.code,
      error: error instanceof Error ? error.message : String(error),
    });
    return rescheduled;
  }
}

// ---------------------------------------------------------------------------
//  Queries
// ---------------------------------------------------------------------------

export interface OrderFilters {
  status?: OrderStatus | OrderStatus[];
  zoneId?: string;
  agentId?: string;
  customerId?: string;
  orderType?: OrderType;
  paymentType?: PaymentType;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
  sort?: 'newest' | 'oldest' | 'value';
}

/** Scope every list query to what the caller is allowed to see. */
export function scopeFor(actor: Actor, agentProfileId?: string | null): Prisma.OrderWhereInput {
  switch (actor.role) {
    case 'ADMIN':
      return {};
    case 'AGENT':
      return { agentId: agentProfileId ?? '__none__' };
    default:
      return { customerId: actor.id };
  }
}

export async function listOrders(where: Prisma.OrderWhereInput, filters: OrderFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));

  const and: Prisma.OrderWhereInput[] = [where];

  if (filters.status) {
    and.push({
      status: Array.isArray(filters.status) ? { in: filters.status } : filters.status,
    });
  }
  if (filters.zoneId) {
    and.push({ OR: [{ pickupZoneId: filters.zoneId }, { dropZoneId: filters.zoneId }] });
  }
  if (filters.agentId) and.push({ agentId: filters.agentId });
  if (filters.customerId) and.push({ customerId: filters.customerId });
  if (filters.orderType) and.push({ orderType: filters.orderType });
  if (filters.paymentType) and.push({ paymentType: filters.paymentType });
  if (filters.from) and.push({ createdAt: { gte: new Date(filters.from) } });
  if (filters.to) and.push({ createdAt: { lte: new Date(filters.to) } });

  if (filters.search) {
    const q = filters.search.trim();
    and.push({
      OR: [
        { code: { contains: q } },
        { customer: { fullName: { contains: q } } },
        { customer: { email: { contains: q } } },
        { pickupAddress: { city: { contains: q } } },
        { dropAddress: { city: { contains: q } } },
        { dropAddress: { pincode: { contains: q } } },
      ],
    });
  }

  const orderBy: Prisma.OrderOrderByWithRelationInput =
    filters.sort === 'oldest'
      ? { createdAt: 'asc' }
      : filters.sort === 'value'
        ? { totalCharge: 'desc' }
        : { createdAt: 'desc' };

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where: { AND: and },
      include: ORDER_INCLUDE,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.order.count({ where: { AND: and } }),
  ]);

  return {
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

export async function getOrderById(id: string) {
  const order = await prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
  if (!order) throw notFound('Order');
  return order;
}

export async function getOrderByCode(code: string) {
  const order = await prisma.order.findUnique({
    where: { code: code.toUpperCase() },
    include: ORDER_INCLUDE,
  });
  if (!order) throw notFound('Order');
  return order;
}

/** Throws unless the actor is allowed to see this specific order. */
export function assertCanView(
  order: { customerId: string; agentId: string | null },
  actor: Actor,
  agentProfileId?: string | null,
): void {
  if (actor.role === 'ADMIN') return;
  if (actor.role === 'CUSTOMER' && order.customerId === actor.id) return;
  if (actor.role === 'AGENT' && agentProfileId && order.agentId === agentProfileId) return;
  throw forbidden('This order does not belong to your account.');
}

export function isActiveStatus(status: string): boolean {
  return ACTIVE_STATUSES.includes(status as OrderStatus);
}

function toTrackingActor(actor: Actor): { id: string | null; role: ActorRole; name: string } {
  return { id: actor.id, role: actor.role, name: actor.name };
}

export type { Quote };
