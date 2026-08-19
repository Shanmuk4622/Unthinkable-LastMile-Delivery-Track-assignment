/**
 * /api/zones — zones and the areas (pincodes) assigned to them.
 *
 * Reads are open to any signed-in user (the booking form needs the coverage
 * list); writes are admin-only.
 */
import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authenticate, authorize, optionalAuth } from '../middleware/auth';
import { asyncHandler, validate } from '../middleware/validate';
import { conflict } from '../utils/errors';
import { tryDetectZoneByPincode } from '../services/zoneService';
import {
  areaSchema,
  areaUpdateSchema,
  idParam,
  serviceabilitySchema,
  zoneSchema,
  zoneUpdateSchema,
} from '../validators';

export const zonesRouter = Router();

/**
 * GET /api/zones/serviceability/:pincode
 * Anonymous — the booking form calls this as the customer types, so it can say
 * "we deliver here (South Bengaluru)" before anything is submitted.
 */
zonesRouter.get(
  '/serviceability/:pincode',
  optionalAuth,
  validate({ params: serviceabilitySchema }),
  asyncHandler(async (req, res) => {
    const resolution = await tryDetectZoneByPincode(req.params.pincode);

    res.json({
      success: true,
      data: {
        pincode: req.params.pincode,
        serviceable: Boolean(resolution),
        zone: resolution
          ? {
              id: resolution.zone.id,
              code: resolution.zone.code,
              name: resolution.zone.name,
              city: resolution.zone.city,
            }
          : null,
        area: resolution ? { name: resolution.area.name, city: resolution.area.city } : null,
      },
    });
  }),
);

zonesRouter.use(authenticate);

/** GET /api/zones */
zonesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const zones = await prisma.zone.findMany({
      orderBy: [{ city: 'asc' }, { code: 'asc' }],
      include: {
        areas: { orderBy: { pincode: 'asc' } },
        _count: { select: { areas: true, agents: true, pickupOrders: true, dropOrders: true } },
      },
    });
    res.json({ success: true, data: zones });
  }),
);

zonesRouter.get(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const zone = await prisma.zone.findUniqueOrThrow({
      where: { id: req.params.id },
      include: {
        areas: { orderBy: { pincode: 'asc' } },
        agents: { include: { user: { select: { fullName: true, email: true } } } },
      },
    });
    res.json({ success: true, data: zone });
  }),
);

zonesRouter.post(
  '/',
  authorize('ADMIN'),
  validate({ body: zoneSchema }),
  asyncHandler(async (req, res) => {
    const zone = await prisma.zone.create({ data: req.body });
    res.status(201).json({ success: true, data: zone });
  }),
);

zonesRouter.put(
  '/:id',
  authorize('ADMIN'),
  validate({ params: idParam, body: zoneUpdateSchema }),
  asyncHandler(async (req, res) => {
    const zone = await prisma.zone.update({ where: { id: req.params.id }, data: req.body });
    res.json({ success: true, data: zone });
  }),
);

/**
 * DELETE /api/zones/:id — refused while orders reference the zone, because a
 * historical shipment must keep pointing at the zone it actually travelled in.
 */
zonesRouter.delete(
  '/:id',
  authorize('ADMIN'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const orders = await prisma.order.count({
      where: { OR: [{ pickupZoneId: req.params.id }, { dropZoneId: req.params.id }] },
    });

    if (orders > 0) {
      const zone = await prisma.zone.update({
        where: { id: req.params.id },
        data: { isActive: false },
      });
      res.json({
        success: true,
        data: zone,
        message: `${orders} order${orders === 1 ? '' : 's'} reference this zone, so it was deactivated instead of deleted.`,
      });
      return;
    }

    await prisma.zone.delete({ where: { id: req.params.id } });
    res.json({ success: true, data: { id: req.params.id, deleted: true } });
  }),
);

// ---------------------------------------------------------------------------
//  Areas — "assign areas to zones"
// ---------------------------------------------------------------------------

zonesRouter.get(
  '/areas/all',
  asyncHandler(async (_req, res) => {
    const areas = await prisma.area.findMany({
      orderBy: [{ city: 'asc' }, { pincode: 'asc' }],
      include: { zone: { select: { id: true, code: true, name: true, city: true } } },
    });
    res.json({ success: true, data: areas });
  }),
);

zonesRouter.post(
  '/areas',
  authorize('ADMIN'),
  validate({ body: areaSchema }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.area.findUnique({
      where: { pincode: req.body.pincode },
      include: { zone: { select: { name: true } } },
    });

    if (existing) {
      throw conflict(
        `Pincode ${req.body.pincode} is already assigned to ${existing.zone.name}. Move it instead of creating a duplicate.`,
        { areaId: existing.id },
      );
    }

    const area = await prisma.area.create({ data: req.body, include: { zone: true } });
    res.status(201).json({ success: true, data: area });
  }),
);

/** PUT /api/zones/areas/:id — this is how a pincode is moved between zones. */
zonesRouter.put(
  '/areas/:id',
  authorize('ADMIN'),
  validate({ params: idParam, body: areaUpdateSchema }),
  asyncHandler(async (req, res) => {
    const area = await prisma.area.update({
      where: { id: req.params.id },
      data: req.body,
      include: { zone: true },
    });
    res.json({ success: true, data: area });
  }),
);

zonesRouter.delete(
  '/areas/:id',
  authorize('ADMIN'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await prisma.area.delete({ where: { id: req.params.id } });
    res.json({ success: true, data: { id: req.params.id, deleted: true } });
  }),
);
