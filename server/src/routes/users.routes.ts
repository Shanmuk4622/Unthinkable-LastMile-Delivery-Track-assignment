/**
 * /api/users — administrative account management.
 *
 * This is where agent and admin accounts come from: self-service registration
 * can only ever create a CUSTOMER, so elevated roles always trace back to a
 * deliberate act by an existing admin.
 */
import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authenticate, authorize } from '../middleware/auth';
import { asyncHandler, validate } from '../middleware/validate';
import { badRequest, conflict } from '../utils/errors';
import { hashPassword, toPublicUser } from '../services/authService';
import { createUserSchema, idParam, listUsersSchema, updateUserSchema } from '../validators';

export const usersRouter = Router();

usersRouter.use(authenticate, authorize('ADMIN'));

const USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  role: true,
  companyName: true,
  isActive: true,
  createdAt: true,
  agentProfile: {
    select: {
      id: true,
      availability: true,
      vehicleType: true,
      vehicleNumber: true,
      zoneId: true,
      activeOrderCount: true,
      maxConcurrentOrders: true,
      currentLat: true,
      currentLng: true,
    },
  },
  _count: { select: { orders: true } },
} as const;

/** GET /api/users?role=&search=&isActive= */
usersRouter.get(
  '/',
  validate({ query: listUsersSchema }),
  asyncHandler(async (req, res) => {
    const { role, search, isActive, page, pageSize } = req.query as unknown as {
      role?: string;
      search?: string;
      isActive?: string;
      page: number;
      pageSize: number;
    };

    const where = {
      ...(role ? { role } : {}),
      ...(isActive ? { isActive: isActive === 'true' } : {}),
      ...(search
        ? {
            OR: [
              { fullName: { contains: search } },
              { email: { contains: search } },
              { companyName: { contains: search } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: USER_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      success: true,
      data: items,
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    });
  }),
);

/**
 * POST /api/users
 * Creating a user with role AGENT provisions the AgentProfile in the same
 * transaction — an agent without a profile could never be dispatched to.
 */
usersRouter.post(
  '/',
  validate({ body: createUserSchema }),
  asyncHandler(async (req, res) => {
    const email = req.body.email as string;

    if (await prisma.user.findUnique({ where: { email } })) {
      throw conflict('An account with that e-mail already exists.');
    }

    const passwordHash = await hashPassword(req.body.password);

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          fullName: req.body.fullName,
          phone: req.body.phone ?? null,
          companyName: req.body.companyName ?? null,
          role: req.body.role,
        },
      });

      if (req.body.role === 'AGENT') {
        await tx.agentProfile.create({
          data: {
            userId: created.id,
            vehicleType: req.body.agent?.vehicleType ?? 'BIKE',
            vehicleNumber: req.body.agent?.vehicleNumber ?? null,
            zoneId: req.body.agent?.zoneId || null,
            maxConcurrentOrders: req.body.agent?.maxConcurrentOrders ?? 5,
            availability: req.body.agent?.availability ?? 'OFFLINE',
            currentLat: req.body.agent?.currentLat ?? null,
            currentLng: req.body.agent?.currentLng ?? null,
          },
        });
      }

      return tx.user.findUniqueOrThrow({ where: { id: created.id }, select: USER_SELECT });
    });

    res.status(201).json({ success: true, data: toPublicUser(user) });
  }),
);

usersRouter.get(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.params.id },
      select: USER_SELECT,
    });
    res.json({ success: true, data: user });
  }),
);

/**
 * PUT /api/users/:id
 * An admin cannot deactivate or demote their own account — that is the classic
 * way to lock every administrator out of a system.
 */
usersRouter.put(
  '/:id',
  validate({ params: idParam, body: updateUserSchema }),
  asyncHandler(async (req, res) => {
    if (req.params.id === req.auth!.id) {
      if (req.body.isActive === false) throw badRequest('You cannot deactivate your own account.');
      if (req.body.role && req.body.role !== 'ADMIN') {
        throw badRequest('You cannot remove your own admin role.');
      }
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: req.body,
      select: USER_SELECT,
    });

    res.json({ success: true, data: user });
  }),
);

/**
 * GET /api/users/customers/lookup?q=
 * Type-ahead for the "create an order on behalf of a customer" flow.
 */
usersRouter.get(
  '/customers/lookup',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '').trim();

    const customers = await prisma.user.findMany({
      where: {
        role: 'CUSTOMER',
        isActive: true,
        ...(q
          ? { OR: [{ fullName: { contains: q } }, { email: { contains: q } }, { companyName: { contains: q } }] }
          : {}),
      },
      select: { id: true, fullName: true, email: true, phone: true, companyName: true },
      orderBy: { fullName: 'asc' },
      take: 20,
    });

    res.json({ success: true, data: customers });
  }),
);
