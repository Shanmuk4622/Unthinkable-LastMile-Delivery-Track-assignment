/**
 * /api/tracking — the public, unauthenticated tracking page.
 *
 * Anyone holding a tracking number can follow a shipment, exactly like every
 * courier in the world. The payload is therefore deliberately redacted: cities
 * and the timeline, yes; full street addresses, phone numbers, declared value
 * and the price breakdown, no. A tracking code is a weak secret, so it must not
 * unlock personal data.
 */
import { Router } from 'express';
import { prisma } from '../config/prisma';
import { asyncHandler, validate } from '../middleware/validate';
import { notFound } from '../utils/errors';
import { codeParam } from '../validators';
import { HAPPY_PATH, ORDER_STATUS_META, type OrderStatus } from '../domain/constants';

export const trackingRouter = Router();

/** GET /api/tracking/:code */
trackingRouter.get(
  '/:code',
  validate({ params: codeParam }),
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findUnique({
      where: { code: req.params.code.toUpperCase().trim() },
      select: {
        code: true,
        status: true,
        orderType: true,
        paymentType: true,
        createdAt: true,
        scheduledDate: true,
        pickedUpAt: true,
        deliveredAt: true,
        failedAt: true,
        failureReason: true,
        attemptCount: true,
        chargeableWeightKg: true,
        customer: { select: { fullName: true } },
        pickupAddress: { select: { city: true, state: true, pincode: true } },
        dropAddress: { select: { city: true, state: true, pincode: true } },
        pickupZone: { select: { code: true, name: true } },
        dropZone: { select: { code: true, name: true } },
        agent: {
          select: {
            vehicleType: true,
            user: { select: { fullName: true } },
          },
        },
        trackingEvents: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            fromStatus: true,
            toStatus: true,
            title: true,
            notes: true,
            actorRole: true,
            createdAt: true,
          },
        },
      },
    });

    if (!order) throw notFound('Shipment');

    const status = order.status as OrderStatus;

    res.json({
      success: true,
      data: {
        ...order,
        // Only the first name — enough to confirm you have the right parcel,
        // not enough to identify the recipient.
        customer: { fullName: order.customer.fullName.split(' ')[0] },
        progress: {
          current: status,
          meta: ORDER_STATUS_META[status],
          step: HAPPY_PATH.indexOf(status),
          totalSteps: HAPPY_PATH.length - 1,
          isTerminal: status === 'DELIVERED' || status === 'CANCELLED',
          needsReschedule: status === 'FAILED',
        },
      },
    });
  }),
);
