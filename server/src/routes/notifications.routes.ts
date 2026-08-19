/**
 * /api/notifications — the outbox.
 *
 * Customers see their own messages; admins see everything and can retry
 * failures. This is what makes the notification pipeline demonstrable on a
 * deployment with no SMTP credentials: every e-mail and SMS the system decided
 * to send is right here, rendered exactly as it would have gone out.
 */
import { Router } from 'express';
import { prisma } from '../config/prisma';
import { actorOf, authenticate, authorize } from '../middleware/auth';
import { asyncHandler, validate } from '../middleware/validate';
import { describeTransports, retryFailed, verifyEmailTransport } from '../services/notifications';
import { idParam, listNotificationsSchema } from '../validators';

export const notificationsRouter = Router();

notificationsRouter.use(authenticate);

/** GET /api/notifications */
notificationsRouter.get(
  '/',
  validate({ query: listNotificationsSchema }),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const { orderId, channel, status, page, pageSize } = req.query as unknown as {
      orderId?: string;
      channel?: string;
      status?: string;
      page: number;
      pageSize: number;
    };

    const where = {
      ...(actor.role === 'ADMIN' ? {} : { userId: actor.id }),
      ...(orderId ? { orderId } : {}),
      ...(channel ? { channel } : {}),
      ...(status ? { status } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          order: { select: { id: true, code: true, status: true } },
          user: { select: { fullName: true, email: true } },
        },
      }),
      prisma.notification.count({ where }),
    ]);

    res.json({
      success: true,
      data: items,
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    });
  }),
);

/** GET /api/notifications/transports — what is actually wired up right now. */
notificationsRouter.get(
  '/transports',
  authorize('ADMIN'),
  asyncHandler(async (_req, res) => {
    const [transports, email] = await Promise.all([
      Promise.resolve(describeTransports()),
      verifyEmailTransport(),
    ]);
    res.json({ success: true, data: { ...transports, emailVerification: email } });
  }),
);

/** POST /api/notifications/retry — re-dispatch every FAILED message. */
notificationsRouter.post(
  '/retry',
  authorize('ADMIN'),
  asyncHandler(async (_req, res) => {
    const count = await retryFailed();
    res.json({
      success: true,
      data: { retried: count },
      message: count ? `Retried ${count} notification(s).` : 'Nothing was waiting to be retried.',
    });
  }),
);

/** GET /api/notifications/:id — the full rendered message, HTML included. */
notificationsRouter.get(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const notification = await prisma.notification.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { order: { select: { code: true } } },
    });

    if (actor.role !== 'ADMIN' && notification.userId !== actor.id) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'That message is not addressed to you.' },
      });
      return;
    }

    res.json({ success: true, data: notification });
  }),
);
