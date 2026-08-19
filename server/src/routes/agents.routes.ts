/**
 * /api/agents — the delivery-agent surface.
 *
 * Split by intent:
 *   • `/me/*`  the agent's own duty status and GPS ping (agent role),
 *   • `/`      the roster with live availability (admin, for dispatch),
 *   • `/:id/*` administrative edits.
 */
import { Router } from 'express';
import { prisma } from '../config/prisma';
import { actorOf, authenticate, authorize } from '../middleware/auth';
import { asyncHandler, validate } from '../middleware/validate';
import { badRequest, forbidden } from '../utils/errors';
import { ACTIVE_STATUSES } from '../domain/constants';
import { agentAvailabilitySchema, agentLocationSchema, idParam, updateAgentSchema } from '../validators';

export const agentsRouter = Router();

agentsRouter.use(authenticate);

const AGENT_INCLUDE = {
  user: { select: { id: true, fullName: true, email: true, phone: true, isActive: true } },
  zone: { select: { id: true, code: true, name: true, city: true } },
} as const;

/** GET /api/agents — the roster. Admins dispatch from this list. */
agentsRouter.get(
  '/',
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const { availability, zoneId } = req.query as Record<string, string | undefined>;

    const agents = await prisma.agentProfile.findMany({
      where: {
        ...(availability ? { availability } : {}),
        ...(zoneId ? { zoneId } : {}),
      },
      include: AGENT_INCLUDE,
      orderBy: [{ availability: 'asc' }, { activeOrderCount: 'asc' }],
    });

    res.json({ success: true, data: agents });
  }),
);

/** GET /api/agents/me — the agent's own profile and today's numbers. */
agentsRouter.get(
  '/me',
  authorize('AGENT'),
  asyncHandler(async (req, res) => {
    const profile = await prisma.agentProfile.findUniqueOrThrow({
      where: { userId: req.auth!.id },
      include: AGENT_INCLUDE,
    });

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [active, deliveredToday, failedToday] = await Promise.all([
      prisma.order.count({ where: { agentId: profile.id, status: { in: [...ACTIVE_STATUSES] } } }),
      prisma.order.count({
        where: { agentId: profile.id, status: 'DELIVERED', deliveredAt: { gte: startOfDay } },
      }),
      prisma.order.count({
        where: { agentId: profile.id, status: 'FAILED', failedAt: { gte: startOfDay } },
      }),
    ]);

    res.json({ success: true, data: { ...profile, today: { active, deliveredToday, failedToday } } });
  }),
);

/**
 * PATCH /api/agents/me/availability
 * Going off duty is refused while orders are still in hand — otherwise parcels
 * would sit in an ASSIGNED state with nobody accountable for them.
 */
agentsRouter.patch(
  '/me/availability',
  authorize('AGENT'),
  validate({ body: agentAvailabilitySchema }),
  asyncHandler(async (req, res) => {
    const profile = await prisma.agentProfile.findUniqueOrThrow({
      where: { userId: req.auth!.id },
    });

    if (req.body.availability === 'OFFLINE' && profile.activeOrderCount > 0) {
      throw badRequest(
        `You still have ${profile.activeOrderCount} active order${profile.activeOrderCount === 1 ? '' : 's'}. Complete or hand them over before going offline.`,
      );
    }

    const updated = await prisma.agentProfile.update({
      where: { id: profile.id },
      data: { availability: req.body.availability },
      include: AGENT_INCLUDE,
    });

    res.json({ success: true, data: updated });
  }),
);

/**
 * POST /api/agents/me/location
 * The GPS ping that makes "nearest available agent" mean something. In a real
 * deployment the driver app calls this every 30–60 s.
 */
agentsRouter.post(
  '/me/location',
  authorize('AGENT'),
  validate({ body: agentLocationSchema }),
  asyncHandler(async (req, res) => {
    const profile = await prisma.agentProfile.findUniqueOrThrow({
      where: { userId: req.auth!.id },
    });

    const updated = await prisma.agentProfile.update({
      where: { id: profile.id },
      data: {
        currentLat: req.body.lat,
        currentLng: req.body.lng,
        lastLocationAt: new Date(),
      },
      select: { id: true, currentLat: true, currentLng: true, lastLocationAt: true },
    });

    res.json({ success: true, data: updated });
  }),
);

/** GET /api/agents/:id */
agentsRouter.get(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    if (actor.role === 'CUSTOMER') throw forbidden();

    const agent = await prisma.agentProfile.findUniqueOrThrow({
      where: { id: req.params.id },
      include: AGENT_INCLUDE,
    });

    res.json({ success: true, data: agent });
  }),
);

/** PUT /api/agents/:id — admin edits vehicle, zone, capacity, availability. */
agentsRouter.put(
  '/:id',
  authorize('ADMIN'),
  validate({ params: idParam, body: updateAgentSchema }),
  asyncHandler(async (req, res) => {
    const updated = await prisma.agentProfile.update({
      where: { id: req.params.id },
      data: {
        ...req.body,
        ...(req.body.currentLat !== undefined || req.body.currentLng !== undefined
          ? { lastLocationAt: new Date() }
          : {}),
      },
      include: AGENT_INCLUDE,
    });

    res.json({ success: true, data: updated });
  }),
);

/** GET /api/agents/:id/workload — what this agent is carrying right now. */
agentsRouter.get(
  '/:id/workload',
  authorize('ADMIN'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const orders = await prisma.order.findMany({
      where: { agentId: req.params.id, status: { in: [...ACTIVE_STATUSES] } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        code: true,
        status: true,
        scheduledDate: true,
        dropAddress: { select: { city: true, pincode: true, line1: true } },
      },
    });

    res.json({ success: true, data: orders });
  }),
);
