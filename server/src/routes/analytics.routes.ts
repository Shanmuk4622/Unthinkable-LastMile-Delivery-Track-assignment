/**
 * /api/analytics — dashboard aggregates.
 *
 * Each role gets a different shape, computed from the same tables:
 *   ADMIN     network-wide throughput, revenue, zone and agent leaderboards
 *   AGENT     personal workload and success rate
 *   CUSTOMER  spend and shipment mix
 */
import { Router } from 'express';
import { prisma } from '../config/prisma';
import { actorOf, authenticate } from '../middleware/auth';
import { asyncHandler } from '../middleware/validate';
import { ACTIVE_STATUSES, ORDER_STATUSES, type OrderStatus } from '../domain/constants';
import { round2 } from '../utils/money';
import * as tracking from '../services/trackingService';

export const analyticsRouter = Router();

analyticsRouter.use(authenticate);

/** GET /api/analytics/dashboard */
analyticsRouter.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);

    const scope =
      actor.role === 'ADMIN'
        ? {}
        : actor.role === 'AGENT'
          ? { agentId: req.auth?.agentProfileId ?? '__none__' }
          : { customerId: actor.id };

    const since = new Date();
    since.setDate(since.getDate() - 13);
    since.setHours(0, 0, 0, 0);

    const [orders, byStatus, recent] = await Promise.all([
      prisma.order.findMany({
        where: scope,
        select: {
          id: true,
          status: true,
          totalCharge: true,
          orderType: true,
          paymentType: true,
          createdAt: true,
          deliveredAt: true,
          pickupZone: { select: { id: true, code: true, name: true } },
        },
      }),
      prisma.order.groupBy({ by: ['status'], where: scope, _count: { _all: true } }),
      actor.role === 'ADMIN' ? tracking.recentActivity(12) : Promise.resolve([]),
    ]);

    const total = orders.length;
    const delivered = orders.filter((o) => o.status === 'DELIVERED').length;
    const failed = orders.filter((o) => o.status === 'FAILED').length;
    const active = orders.filter((o) => ACTIVE_STATUSES.includes(o.status as OrderStatus)).length;
    const revenue = round2(orders.reduce((sum, o) => sum + o.totalCharge, 0));

    // ---- 14-day time series -------------------------------------------
    const days: Record<string, { date: string; orders: number; delivered: number; revenue: number }> = {};
    for (let i = 0; i < 14; i += 1) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      days[key] = { date: key, orders: 0, delivered: 0, revenue: 0 };
    }
    for (const order of orders) {
      const key = order.createdAt.toISOString().slice(0, 10);
      const bucket = days[key];
      if (!bucket) continue;
      bucket.orders += 1;
      bucket.revenue = round2(bucket.revenue + order.totalCharge);
      if (order.status === 'DELIVERED') bucket.delivered += 1;
    }

    // ---- mix ------------------------------------------------------------
    const mix = {
      byOrderType: countBy(orders, (o) => o.orderType),
      byPaymentType: countBy(orders, (o) => o.paymentType),
      byZone: Object.values(
        orders.reduce<Record<string, { code: string; name: string; orders: number; revenue: number }>>(
          (acc, o) => {
            if (!o.pickupZone) return acc;
            const key = o.pickupZone.id;
            acc[key] ??= { code: o.pickupZone.code, name: o.pickupZone.name, orders: 0, revenue: 0 };
            acc[key].orders += 1;
            acc[key].revenue = round2(acc[key].revenue + o.totalCharge);
            return acc;
          },
          {},
        ),
      ).sort((a, b) => b.orders - a.orders),
    };

    const statusCounts = Object.fromEntries(
      ORDER_STATUSES.map((s) => [s, byStatus.find((row) => row.status === s)?._count._all ?? 0]),
    ) as Record<OrderStatus, number>;

    // ---- admin-only extras ---------------------------------------------
    let network: Record<string, unknown> | undefined;
    if (actor.role === 'ADMIN') {
      const [agentRows, zoneCount, areaCount, customerCount, queued] = await Promise.all([
        prisma.agentProfile.findMany({
          include: { user: { select: { fullName: true } }, zone: { select: { code: true } } },
          orderBy: { totalDelivered: 'desc' },
          take: 8,
        }),
        prisma.zone.count({ where: { isActive: true } }),
        prisma.area.count({ where: { isActive: true } }),
        prisma.user.count({ where: { role: 'CUSTOMER' } }),
        prisma.order.count({ where: { status: 'CONFIRMED', agentId: null } }),
      ]);

      network = {
        zones: zoneCount,
        areas: areaCount,
        customers: customerCount,
        awaitingAssignment: queued,
        agents: {
          total: agentRows.length,
          available: agentRows.filter((a) => a.availability === 'AVAILABLE').length,
          leaderboard: agentRows.map((a) => ({
            id: a.id,
            name: a.user.fullName,
            zone: a.zone?.code ?? null,
            availability: a.availability,
            activeOrders: a.activeOrderCount,
            capacity: a.maxConcurrentOrders,
            delivered: a.totalDelivered,
            failed: a.totalFailed,
            successRate:
              a.totalDelivered + a.totalFailed === 0
                ? null
                : Math.round((a.totalDelivered / (a.totalDelivered + a.totalFailed)) * 100),
          })),
        },
      };
    }

    res.json({
      success: true,
      data: {
        role: actor.role,
        totals: {
          orders: total,
          delivered,
          failed,
          active,
          revenue,
          averageOrderValue: total ? round2(revenue / total) : 0,
          successRate: delivered + failed === 0 ? null : Math.round((delivered / (delivered + failed)) * 100),
        },
        statusCounts,
        series: Object.values(days),
        mix,
        recentActivity: recent,
        ...(network ? { network } : {}),
      },
    });
  }),
);

function countBy<T>(items: T[], key: (item: T) => string): Array<{ name: string; value: number }> {
  const acc: Record<string, number> = {};
  for (const item of items) {
    const k = key(item);
    acc[k] = (acc[k] ?? 0) + 1;
  }
  return Object.entries(acc).map(([name, value]) => ({ name, value }));
}
