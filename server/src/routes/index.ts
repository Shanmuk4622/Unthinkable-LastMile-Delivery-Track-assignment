/**
 * API surface.
 *
 *   /api/health          liveness + wiring report
 *   /api/meta            enums, status metadata and the transition graph
 *   /api/auth            sessions
 *   /api/pricing         quote + admin rate configuration
 *   /api/zones           zones and pincode->zone assignment
 *   /api/orders          the order lifecycle
 *   /api/agents          agent duty status and roster
 *   /api/users           administrative account management
 *   /api/notifications   the outbox
 *   /api/analytics       dashboards
 *   /api/tracking        public tracking by code (no auth)
 */
import { Router } from 'express';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { asyncHandler } from '../middleware/validate';
import { describeTransports } from '../services/notifications';
import { TRANSITIONS, ROLE_PERMITTED_TARGETS } from '../domain/orderStateMachine';
import {
  AGENT_AVAILABILITY,
  FAILURE_REASONS,
  HAPPY_PATH,
  ORDER_STATUSES,
  ORDER_STATUS_META,
  ORDER_TYPES,
  PAYMENT_TYPES,
  RATE_SCOPES,
  ROLES,
  VEHICLE_CAPACITY_KG,
  VEHICLE_TYPES,
} from '../domain/constants';

import { authRouter } from './auth.routes';
import { ordersRouter } from './orders.routes';
import { pricingRouter } from './pricing.routes';
import { zonesRouter } from './zones.routes';
import { agentsRouter } from './agents.routes';
import { usersRouter } from './users.routes';
import { trackingRouter } from './tracking.routes';
import { notificationsRouter } from './notifications.routes';
import { analyticsRouter } from './analytics.routes';

export const apiRouter = Router();

/**
 * GET /api/health
 * Reports whether the database answers and which notification transports are
 * live — the first thing to check after a deploy.
 */
apiRouter.get(
  '/health',
  asyncHandler(async (_req, res) => {
    const startedAt = Date.now();
    let database = 'up';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }

    res.status(database === 'up' ? 200 : 503).json({
      success: database === 'up',
      data: {
        status: database === 'up' ? 'healthy' : 'degraded',
        service: 'swiftroute-api',
        version: '1.0.0',
        environment: env.NODE_ENV,
        database,
        latencyMs: Date.now() - startedAt,
        notifications: describeTransports(),
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      },
    });
  }),
);

/**
 * GET /api/meta
 * One call that hands the client every enum, label, colour tone and legal state
 * transition. The frontend never hardcodes a status string.
 */
apiRouter.get('/meta', (_req, res) => {
  res.json({
    success: true,
    data: {
      roles: ROLES,
      orderTypes: ORDER_TYPES,
      paymentTypes: PAYMENT_TYPES,
      orderStatuses: ORDER_STATUSES,
      statusMeta: ORDER_STATUS_META,
      happyPath: HAPPY_PATH,
      transitions: TRANSITIONS,
      rolePermittedTargets: ROLE_PERMITTED_TARGETS,
      agentAvailability: AGENT_AVAILABILITY,
      vehicleTypes: VEHICLE_TYPES,
      vehicleCapacityKg: VEHICLE_CAPACITY_KG,
      rateScopes: RATE_SCOPES,
      failureReasons: FAILURE_REASONS,
    },
  });
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/pricing', pricingRouter);
apiRouter.use('/zones', zonesRouter);
apiRouter.use('/orders', ordersRouter);
apiRouter.use('/agents', agentsRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/analytics', analyticsRouter);
apiRouter.use('/tracking', trackingRouter);
