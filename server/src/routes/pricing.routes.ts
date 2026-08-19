/**
 * /api/pricing — the admin-configurable rate engine, plus the public quote
 * endpoint that shows a customer the charge *before* they confirm.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { authenticate, authorize, optionalAuth } from '../middleware/auth';
import { asyncHandler, validate } from '../middleware/validate';
import { notFound } from '../utils/errors';
import {
  calculateQuote,
  getPricingSettings,
  resolveCodRule,
  resolveRateCard,
} from '../services/rateEngine';
import {
  codRuleSchema,
  codRuleUpdateSchema,
  idParam,
  pricingSettingsSchema,
  quoteSchema,
  rateCardSchema,
  rateCardUpdateSchema,
} from '../validators';

export const pricingRouter = Router();

// ---------------------------------------------------------------------------
//  Quote — the pre-confirmation price
// ---------------------------------------------------------------------------

/**
 * POST /api/pricing/quote
 * Deliberately open to anonymous callers: a shipper wants to price a parcel
 * before creating an account. It is a pure read — nothing is persisted.
 */
pricingRouter.post(
  '/quote',
  optionalAuth,
  validate({ body: quoteSchema }),
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await calculateQuote(req.body) });
  }),
);

// ---------------------------------------------------------------------------
//  Configuration (read: any signed-in user, write: admin)
// ---------------------------------------------------------------------------

pricingRouter.get(
  '/settings',
  authenticate,
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await getPricingSettings() });
  }),
);

/** PUT /api/pricing/settings — volumetric divisor, slab size, minimum weight. */
pricingRouter.put(
  '/settings',
  authenticate,
  authorize('ADMIN'),
  validate({ body: pricingSettingsSchema }),
  asyncHandler(async (req, res) => {
    const updated = await prisma.pricingSetting.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...req.body },
      update: req.body,
    });
    res.json({ success: true, data: updated });
  }),
);

// ---- rate cards -----------------------------------------------------------

pricingRouter.get(
  '/rate-cards',
  authenticate,
  asyncHandler(async (_req, res) => {
    const cards = await prisma.rateCard.findMany({
      orderBy: [{ orderType: 'asc' }, { scope: 'asc' }, { priority: 'desc' }],
      include: {
        fromZone: { select: { id: true, code: true, name: true } },
        toZone: { select: { id: true, code: true, name: true } },
        _count: { select: { orders: true } },
      },
    });
    res.json({ success: true, data: cards });
  }),
);

pricingRouter.post(
  '/rate-cards',
  authenticate,
  authorize('ADMIN'),
  validate({ body: rateCardSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof rateCardSchema>;
    const card = await prisma.rateCard.create({
      data: {
        name: body.name,
        orderType: body.orderType,
        scope: body.scope,
        fromZoneId: body.fromZoneId || null,
        toZoneId: body.toZoneId || null,
        baseWeightKg: body.baseWeightKg,
        basePrice: body.basePrice,
        incrementalWeightKg: body.incrementalWeightKg,
        incrementalPrice: body.incrementalPrice,
        fuelSurchargePct: body.fuelSurchargePct,
        gstPct: body.gstPct,
        handlingFee: body.handlingFee,
        priority: body.priority,
        isActive: body.isActive,
        ...(body.effectiveFrom ? { effectiveFrom: new Date(body.effectiveFrom) } : {}),
        effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : null,
      },
    });
    res.status(201).json({ success: true, data: card });
  }),
);

pricingRouter.put(
  '/rate-cards/:id',
  authenticate,
  authorize('ADMIN'),
  validate({ params: idParam, body: rateCardUpdateSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof rateCardUpdateSchema>;
    const card = await prisma.rateCard.update({
      where: { id: req.params.id },
      data: {
        ...toDateFields(body),
        // '' from an emptied <select> means "clear the lane override".
        ...(body.fromZoneId !== undefined ? { fromZoneId: body.fromZoneId || null } : {}),
        ...(body.toZoneId !== undefined ? { toZoneId: body.toZoneId || null } : {}),
      },
    });
    res.json({ success: true, data: card });
  }),
);

/**
 * DELETE /api/pricing/rate-cards/:id
 * Cards that have priced real orders are deactivated rather than deleted —
 * destroying them would orphan the pricing snapshot on those invoices.
 */
pricingRouter.delete(
  '/rate-cards/:id',
  authenticate,
  authorize('ADMIN'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const used = await prisma.order.count({ where: { rateCardId: req.params.id } });

    if (used > 0) {
      const card = await prisma.rateCard.update({
        where: { id: req.params.id },
        data: { isActive: false },
      });
      res.json({
        success: true,
        data: card,
        message: `This card has priced ${used} order${used === 1 ? '' : 's'}, so it was archived instead of deleted.`,
      });
      return;
    }

    await prisma.rateCard.delete({ where: { id: req.params.id } });
    res.json({ success: true, data: { id: req.params.id, deleted: true } });
  }),
);

// ---- COD rules ------------------------------------------------------------

pricingRouter.get(
  '/cod-rules',
  authenticate,
  asyncHandler(async (_req, res) => {
    res.json({
      success: true,
      data: await prisma.codRule.findMany({ orderBy: [{ orderType: 'asc' }] }),
    });
  }),
);

pricingRouter.post(
  '/cod-rules',
  authenticate,
  authorize('ADMIN'),
  validate({ body: codRuleSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof codRuleSchema>;
    const rule = await prisma.codRule.create({
      data: {
        orderType: body.orderType,
        flatFee: body.flatFee,
        percentOfValue: body.percentOfValue,
        minFee: body.minFee,
        maxFee: body.maxFee ?? null,
        isActive: body.isActive,
        ...(body.effectiveFrom ? { effectiveFrom: new Date(body.effectiveFrom) } : {}),
        effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : null,
      },
    });
    res.status(201).json({ success: true, data: rule });
  }),
);

pricingRouter.put(
  '/cod-rules/:id',
  authenticate,
  authorize('ADMIN'),
  validate({ params: idParam, body: codRuleUpdateSchema }),
  asyncHandler(async (req, res) => {
    const rule = await prisma.codRule.update({
      where: { id: req.params.id },
      data: toDateFields(req.body as z.infer<typeof codRuleUpdateSchema>),
    });
    res.json({ success: true, data: rule });
  }),
);

pricingRouter.delete(
  '/cod-rules/:id',
  authenticate,
  authorize('ADMIN'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await prisma.codRule.delete({ where: { id: req.params.id } });
    res.json({ success: true, data: { id: req.params.id, deleted: true } });
  }),
);

/**
 * GET /api/pricing/resolve?orderType=&scope=&fromZoneId=&toZoneId=
 * "Which card would price this lane, and why?" — the admin's debugging tool
 * for the resolution precedence rules.
 */
pricingRouter.get(
  '/resolve',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const { orderType, scope, fromZoneId, toZoneId } = req.query as Record<string, string>;

    if (!orderType || !scope || !fromZoneId || !toZoneId) {
      throw notFound('orderType, scope, fromZoneId and toZoneId are all required');
    }

    const [{ card, laneSpecific }, codRule] = await Promise.all([
      resolveRateCard({
        orderType: orderType as 'B2B' | 'B2C',
        scope: scope as 'INTRA_ZONE' | 'INTER_ZONE',
        pickupZoneId: fromZoneId,
        dropZoneId: toZoneId,
      }),
      resolveCodRule(orderType as 'B2B' | 'B2C'),
    ]);

    res.json({
      success: true,
      data: {
        card,
        laneSpecific,
        codRule,
        explanation: laneSpecific
          ? 'A lane-specific card exists for this exact zone pair, so it takes precedence.'
          : 'No lane override exists; the generic card for this scope applies.',
      },
    });
  }),
);

function toDateFields<T extends Record<string, unknown>>(body: T) {
  const out: Record<string, unknown> = { ...body };
  if (out.effectiveFrom) out.effectiveFrom = new Date(out.effectiveFrom as string);
  if (out.effectiveTo) out.effectiveTo = new Date(out.effectiveTo as string);
  else if (out.effectiveTo === null) out.effectiveTo = null;
  return out;
}
