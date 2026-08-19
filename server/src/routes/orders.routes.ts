/**
 * /api/orders — the order lifecycle.
 *
 * Authorisation is layered:
 *   • the router requires a session,
 *   • `scopeFor()` narrows every list query to the caller's own data,
 *   • `assertCanView()` guards single-record reads,
 *   • role checks guard each mutation.
 * A customer therefore cannot see, let alone touch, anyone else's shipment even
 * if they guess an id.
 */
import { Router } from 'express';
import { prisma } from '../config/prisma';
import { actorOf, authenticate, authorize } from '../middleware/auth';
import { asyncHandler, validate } from '../middleware/validate';
import { badRequest, forbidden } from '../utils/errors';
import { unpackJson } from '../utils/serialize';
import { roleMayRequest, nextStatuses } from '../domain/orderStateMachine';
import type { OrderStatus } from '../domain/constants';
import * as orders from '../services/orderService';
import * as tracking from '../services/trackingService';
import {
  assignSchema,
  cancelSchema,
  changeStatusSchema,
  createOrderSchema,
  idParam,
  listOrdersSchema,
  rescheduleSchema,
} from '../validators';

export const ordersRouter = Router();

ordersRouter.use(authenticate);

/**
 * POST /api/orders
 * Customers book for themselves. Admins may pass `customerId` to book on behalf
 * of someone — exactly the "admin creates an order for a customer" requirement.
 */
ordersRouter.post(
  '/',
  authorize('CUSTOMER', 'ADMIN'),
  validate({ body: createOrderSchema }),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);

    if (req.body.customerId && actor.role !== 'ADMIN') {
      throw forbidden('Only operations staff can place an order on behalf of another customer.');
    }

    const order = await orders.createOrder(
      { ...req.body, customerId: req.body.customerId ?? actor.id },
      actor,
    );

    res.status(201).json({ success: true, data: withBreakdown(order) });
  }),
);

/** GET /api/orders — role-scoped, filterable, paginated. */
ordersRouter.get(
  '/',
  validate({ query: listOrdersSchema }),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const filters = req.query as unknown as orders.OrderFilters;

    const result = await orders.listOrders(
      orders.scopeFor(actor, req.auth?.agentProfileId),
      filters,
    );

    res.json({ success: true, data: result.items, pagination: result.pagination });
  }),
);

/** GET /api/orders/:id */
ordersRouter.get(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const order = await orders.getOrderById(req.params.id);
    orders.assertCanView(order, actor, req.auth?.agentProfileId);

    const history = await tracking.historyFor(order.id);

    res.json({
      success: true,
      data: {
        ...withBreakdown(order),
        trackingEvents: history,
        allowedNextStatuses: nextStatuses(order.status as OrderStatus),
      },
    });
  }),
);

/** GET /api/orders/:id/tracking — the immutable history on its own. */
ordersRouter.get(
  '/:id/tracking',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const order = await orders.getOrderById(req.params.id);
    orders.assertCanView(order, actor, req.auth?.agentProfileId);
    res.json({ success: true, data: await tracking.historyFor(order.id) });
  }),
);

/**
 * PATCH /api/orders/:id/status
 * The one status endpoint for all three roles. Agents may only move their own
 * orders and only through the delivery statuses; admins may override the graph.
 */
ordersRouter.patch(
  '/:id/status',
  validate({ params: idParam, body: changeStatusSchema }),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const target = req.body.status as OrderStatus;

    const order = await orders.getOrderById(req.params.id);
    orders.assertCanView(order, actor, req.auth?.agentProfileId);

    if (!roleMayRequest(actor.role, target)) {
      const role = actor.role.toLowerCase();
      throw forbidden(
        `${/^[aeiou]/.test(role) ? 'An' : 'A'} ${role} cannot set an order to ${target}.`,
      );
    }
    if (actor.role === 'AGENT' && order.agentId !== req.auth?.agentProfileId) {
      throw forbidden('You can only update orders assigned to you.');
    }

    const updated = await orders.changeStatus(order.id, target, actor, {
      notes: req.body.notes,
      failureReason: req.body.failureReason,
      lat: req.body.lat,
      lng: req.body.lng,
      override: actor.role === 'ADMIN' ? req.body.override : false,
    });

    res.json({ success: true, data: withBreakdown(updated) });
  }),
);

/** POST /api/orders/:id/assign — admin picks the agent. */
ordersRouter.post(
  '/:id/assign',
  authorize('ADMIN'),
  validate({ params: idParam, body: assignSchema }),
  asyncHandler(async (req, res) => {
    const order = await orders.assignManually(
      req.params.id,
      req.body.agentId,
      actorOf(req),
      req.body.reason,
    );
    res.json({ success: true, data: withBreakdown(order) });
  }),
);

/** POST /api/orders/:id/auto-assign — run the dispatcher. */
ordersRouter.post(
  '/:id/auto-assign',
  authorize('ADMIN'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const order = await orders.autoAssign(req.params.id, actorOf(req));
    res.json({ success: true, data: withBreakdown(order) });
  }),
);

/**
 * GET /api/orders/:id/assignment-preview
 * Dry run: the ranked shortlist with every score, plus who was filtered out and
 * why. This is what makes the auto-assigner explainable rather than magic.
 */
ordersRouter.get(
  '/:id/assignment-preview',
  authorize('ADMIN'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await orders.previewAssignment(req.params.id) });
  }),
);

/** GET /api/orders/:id/assignments — the assignment audit trail. */
ordersRouter.get(
  '/:id/assignments',
  authorize('ADMIN'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const rows = await prisma.assignmentHistory.findMany({
      where: { orderId: req.params.id },
      orderBy: { createdAt: 'desc' },
      include: {
        agent: { include: { user: { select: { fullName: true, phone: true } } } },
        assignedBy: { select: { fullName: true, role: true } },
      },
    });

    res.json({
      success: true,
      data: rows.map((row) => ({
        ...row,
        candidateSnapshot: unpackJson(row.candidateSnapshot, null),
      })),
    });
  }),
);

/**
 * POST /api/orders/:id/reschedule
 * The failed-delivery recovery path: capture the new date, then re-dispatch to
 * a *different* agent.
 */
ordersRouter.post(
  '/:id/reschedule',
  authorize('CUSTOMER', 'ADMIN'),
  validate({ params: idParam, body: rescheduleSchema }),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const order = await orders.getOrderById(req.params.id);
    orders.assertCanView(order, actor);

    const updated = await orders.reschedule(
      order.id,
      { newDate: req.body.newDate, reason: req.body.reason },
      actor,
    );

    res.json({ success: true, data: withBreakdown(updated) });
  }),
);

/** POST /api/orders/:id/cancel */
ordersRouter.post(
  '/:id/cancel',
  authorize('CUSTOMER', 'ADMIN'),
  validate({ params: idParam, body: cancelSchema }),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const order = await orders.getOrderById(req.params.id);
    orders.assertCanView(order, actor);

    if (actor.role === 'CUSTOMER' && !['PENDING', 'CONFIRMED'].includes(order.status)) {
      throw badRequest(
        'This shipment has already entered the network. Contact support to cancel it.',
      );
    }

    const updated = await orders.changeStatus(order.id, 'CANCELLED', actor, {
      notes: req.body.reason ?? 'Cancelled on request',
      override: actor.role === 'ADMIN',
    });

    res.json({ success: true, data: withBreakdown(updated) });
  }),
);

/** GET /api/orders/:id/reschedules */
ordersRouter.get(
  '/:id/reschedules',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const order = await orders.getOrderById(req.params.id);
    orders.assertCanView(order, actor, req.auth?.agentProfileId);

    res.json({
      success: true,
      data: await prisma.rescheduleRequest.findMany({
        where: { orderId: order.id },
        orderBy: { createdAt: 'desc' },
        include: { requestedBy: { select: { fullName: true, role: true } } },
      }),
    });
  }),
);

/** Decode the stored JSON breakdown so clients never have to. */
function withBreakdown<T extends { pricingBreakdown: string | null }>(order: T) {
  return { ...order, pricingBreakdown: unpackJson(order.pricingBreakdown, null) };
}
