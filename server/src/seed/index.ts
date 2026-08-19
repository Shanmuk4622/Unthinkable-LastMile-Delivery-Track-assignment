/**
 * Database seeder.
 * ---------------------------------------------------------------------------
 * Idempotent: every write is an upsert keyed on a natural unique column, so
 * running it twice is safe and running it against a half-populated database
 * fills in the gaps rather than exploding.
 *
 * It seeds in two layers:
 *
 *   1. CONFIGURATION — zones, areas, pricing settings, rate cards, COD rules
 *      and accounts. Always applied.
 *   2. DEMO ORDERS   — a fortnight of realistic shipments spread across every
 *      status, priced by the *real* rate engine and carrying genuine tracking
 *      histories. Skipped when SEED_DEMO_ORDERS=false, or when orders already
 *      exist.
 *
 * The demo orders are written directly rather than pushed through the order
 * service, because they need backdated timestamps: a dashboard that shows a
 * 14-day trend line needs 14 days of history, and no amount of clicking at
 * seed time produces that.
 */
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';
import { hashPassword } from '../services/authService';
import { calculateQuote } from '../services/rateEngine';
import { generateOrderCode, packJson } from '../utils/serialize';
import { round2 } from '../utils/money';
import { ORDER_STATUS_META, type OrderStatus } from '../domain/constants';
import { AGENTS, COD_RULES, CUSTOMERS, RATE_CARDS, ZONES } from './fixtures';

const prisma = new PrismaClient();

/** Deterministic PRNG so every seeded database looks identical. */
function makeRandom(seed = 20260820) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}
const random = makeRandom();

const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
const between = (min: number, max: number, decimals = 1): number => {
  const value = min + random() * (max - min);
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
};

export async function seed(): Promise<void> {
  const log = (message: string) => console.log(`  ${message}`);

  console.log('\n  ⚡ Seeding SwiftRoute\n  ─────────────────────────────');

  // -------------------------------------------------------------------------
  //  1. Zones + areas
  // -------------------------------------------------------------------------
  const zoneByCode = new Map<string, { id: string; centerLat: number; centerLng: number }>();

  for (const fixture of ZONES) {
    const zone = await prisma.zone.upsert({
      where: { code: fixture.code },
      update: {
        name: fixture.name,
        city: fixture.city,
        state: fixture.state,
        description: fixture.description,
        centerLat: fixture.centerLat,
        centerLng: fixture.centerLng,
        isActive: true,
      },
      create: {
        code: fixture.code,
        name: fixture.name,
        city: fixture.city,
        state: fixture.state,
        description: fixture.description,
        centerLat: fixture.centerLat,
        centerLng: fixture.centerLng,
      },
    });

    zoneByCode.set(fixture.code, {
      id: zone.id,
      centerLat: fixture.centerLat,
      centerLng: fixture.centerLng,
    });

    for (const area of fixture.areas) {
      await prisma.area.upsert({
        where: { pincode: area.pincode },
        update: {
          name: area.name,
          city: fixture.city,
          state: fixture.state,
          zoneId: zone.id,
          lat: area.lat,
          lng: area.lng,
          isActive: true,
        },
        create: {
          pincode: area.pincode,
          name: area.name,
          city: fixture.city,
          state: fixture.state,
          zoneId: zone.id,
          lat: area.lat,
          lng: area.lng,
        },
      });
    }
  }

  const areaCount = ZONES.reduce((n, z) => n + z.areas.length, 0);
  log(`✓ ${ZONES.length} zones · ${areaCount} serviceable pincodes`);

  // -------------------------------------------------------------------------
  //  2. Pricing configuration
  // -------------------------------------------------------------------------
  await prisma.pricingSetting.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      volumetricDivisor: 5000,
      weightRoundingKg: 0.5,
      minChargeableWeightKg: 0.5,
      currency: 'INR',
    },
  });

  for (const fixture of RATE_CARDS) {
    const fromZoneId = fixture.fromZoneCode ? zoneByCode.get(fixture.fromZoneCode)?.id : null;
    const toZoneId = fixture.toZoneCode ? zoneByCode.get(fixture.toZoneCode)?.id : null;

    const existing = await prisma.rateCard.findFirst({ where: { name: fixture.name } });
    const data = {
      name: fixture.name,
      orderType: fixture.orderType,
      scope: fixture.scope,
      fromZoneId: fromZoneId ?? null,
      toZoneId: toZoneId ?? null,
      baseWeightKg: fixture.baseWeightKg,
      basePrice: fixture.basePrice,
      incrementalWeightKg: fixture.incrementalWeightKg,
      incrementalPrice: fixture.incrementalPrice,
      fuelSurchargePct: fixture.fuelSurchargePct,
      gstPct: fixture.gstPct,
      handlingFee: fixture.handlingFee,
      priority: fixture.priority,
      isActive: true,
    };

    if (existing) await prisma.rateCard.update({ where: { id: existing.id }, data });
    else await prisma.rateCard.create({ data });
  }

  for (const rule of COD_RULES) {
    const existing = await prisma.codRule.findFirst({
      where: { orderType: rule.orderType, isActive: true },
    });
    if (existing) await prisma.codRule.update({ where: { id: existing.id }, data: rule });
    else await prisma.codRule.create({ data: rule });
  }

  log(`✓ ${RATE_CARDS.length} rate cards · ${COD_RULES.length} COD rules · pricing settings`);

  // -------------------------------------------------------------------------
  //  3. Accounts
  // -------------------------------------------------------------------------
  const adminPassword = await hashPassword(env.SEED_ADMIN_PASSWORD);
  const demoPassword = await hashPassword(env.SEED_DEMO_PASSWORD);

  const admin = await prisma.user.upsert({
    where: { email: env.SEED_ADMIN_EMAIL },
    update: { role: 'ADMIN', isActive: true },
    create: {
      email: env.SEED_ADMIN_EMAIL,
      passwordHash: adminPassword,
      fullName: 'Operations Admin',
      phone: '+919000000001',
      role: 'ADMIN',
    },
  });

  const customers = [];
  for (const fixture of CUSTOMERS) {
    customers.push(
      await prisma.user.upsert({
        where: { email: fixture.email },
        update: { fullName: fixture.fullName, phone: fixture.phone, companyName: fixture.companyName },
        create: {
          email: fixture.email,
          passwordHash: demoPassword,
          fullName: fixture.fullName,
          phone: fixture.phone,
          companyName: fixture.companyName,
          role: 'CUSTOMER',
        },
      }),
    );
  }

  const agents = [];
  for (const fixture of AGENTS) {
    const user = await prisma.user.upsert({
      where: { email: fixture.email },
      update: { fullName: fixture.fullName, phone: fixture.phone, role: 'AGENT' },
      create: {
        email: fixture.email,
        passwordHash: demoPassword,
        fullName: fixture.fullName,
        phone: fixture.phone,
        role: 'AGENT',
      },
    });

    const zoneId = zoneByCode.get(fixture.zoneCode)?.id ?? null;
    const profileData = {
      vehicleType: fixture.vehicleType,
      vehicleNumber: fixture.vehicleNumber,
      zoneId,
      availability: fixture.availability,
      maxConcurrentOrders: fixture.maxConcurrentOrders,
      currentLat: fixture.lat,
      currentLng: fixture.lng,
      lastLocationAt: new Date(),
      totalDelivered: fixture.totalDelivered,
      totalFailed: fixture.totalFailed,
      ratingAvg: fixture.ratingAvg,
    };

    const profile = await prisma.agentProfile.upsert({
      where: { userId: user.id },
      update: profileData,
      create: { userId: user.id, ...profileData },
    });

    agents.push({ profile, user, fixture });
  }

  log(`✓ 1 admin · ${customers.length} customers · ${agents.length} delivery agents`);

  // -------------------------------------------------------------------------
  //  4. Demo orders
  // -------------------------------------------------------------------------
  if (!env.SEED_DEMO_ORDERS) {
    log('· demo orders skipped (SEED_DEMO_ORDERS=false)');
    await summary();
    return;
  }

  const existingOrders = await prisma.order.count();
  if (existingOrders > 0) {
    log(`· demo orders skipped (${existingOrders} orders already exist)`);
    await summary();
    return;
  }

  const allAreas = ZONES.flatMap((zone) =>
    zone.areas.map((area) => ({ ...area, zoneCode: zone.code, city: zone.city, state: zone.state })),
  );

  /**
   * Status mix chosen to exercise every screen in the product: a healthy
   * majority delivered, a live pipeline at each intermediate stage, plus the
   * failure and reschedule cases the brief cares about.
   */
  const STATUS_PLAN: OrderStatus[] = [
    ...Array<OrderStatus>(11).fill('DELIVERED'),
    ...Array<OrderStatus>(3).fill('OUT_FOR_DELIVERY'),
    ...Array<OrderStatus>(3).fill('IN_TRANSIT'),
    ...Array<OrderStatus>(2).fill('PICKED_UP'),
    ...Array<OrderStatus>(3).fill('ASSIGNED'),
    ...Array<OrderStatus>(3).fill('CONFIRMED'),
    ...Array<OrderStatus>(2).fill('FAILED'),
    'RESCHEDULED',
    'PENDING',
    'CANCELLED',
  ];

  const FIRST_NAMES = ['Aditi', 'Rohan', 'Sneha', 'Karthik', 'Divya', 'Manish', 'Farah', 'Joseph'];
  const LAST_NAMES = ['Reddy', 'Pillai', 'Gupta', 'Fernandes', 'Bose', 'Chauhan', 'Mathew'];

  let created = 0;

  for (let i = 0; i < STATUS_PLAN.length; i += 1) {
    const targetStatus = STATUS_PLAN[i];

    // Spread the batch across the last 14 days, newest last.
    const daysAgo = Math.floor((STATUS_PLAN.length - i - 1) * (13 / STATUS_PLAN.length)) + (random() < 0.3 ? 1 : 0);
    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - daysAgo);
    createdAt.setHours(8 + Math.floor(random() * 10), Math.floor(random() * 60), 0, 0);
    // An order booked "today at 6pm" must not be in the future at seed time.
    if (createdAt.getTime() > Date.now() - 30 * 60_000) {
      createdAt.setTime(Date.now() - (30 + Math.floor(random() * 240)) * 60_000);
    }

    const pickupArea = pick(allAreas);
    // 60% intra-city, 40% cross-zone, so both rate-card scopes get exercised.
    const dropPool = random() < 0.6
      ? allAreas.filter((a) => a.city === pickupArea.city && a.pincode !== pickupArea.pincode)
      : allAreas.filter((a) => a.pincode !== pickupArea.pincode);
    const dropArea = pick(dropPool.length ? dropPool : allAreas);

    const customer = pick(customers);
    const orderType = customer.companyName ? (random() < 0.8 ? 'B2B' : 'B2C') : 'B2C';
    const paymentType = random() < 0.45 ? 'COD' : 'PREPAID';

    const isBulk = orderType === 'B2B';
    const lengthCm = between(isBulk ? 30 : 12, isBulk ? 80 : 40, 0);
    const breadthCm = between(isBulk ? 25 : 10, isBulk ? 60 : 30, 0);
    const heightCm = between(isBulk ? 20 : 6, isBulk ? 50 : 25, 0);
    const actualWeightKg = between(isBulk ? 4 : 0.3, isBulk ? 40 : 6, 2);
    const declaredValue = paymentType === 'COD' ? between(isBulk ? 5000 : 400, isBulk ? 60000 : 9000, 0) : 0;

    // Real engine, real numbers.
    const quote = await calculateQuote({
      pickupPincode: pickupArea.pincode,
      dropPincode: dropArea.pincode,
      lengthCm,
      breadthCm,
      heightCm,
      actualWeightKg,
      orderType,
      paymentType,
      declaredValue,
    });

    const contactName = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;

    const pickupAddress = await prisma.address.create({
      data: {
        contactName: customer.fullName,
        contactPhone: customer.phone ?? '+919845000000',
        line1: `${Math.floor(random() * 180) + 1}, ${pickupArea.name} Main Road`,
        line2: customer.companyName ? `${customer.companyName} Warehouse` : `Flat ${Math.floor(random() * 40) + 1}B`,
        city: pickupArea.city,
        state: pickupArea.state,
        pincode: pickupArea.pincode,
        lat: pickupArea.lat,
        lng: pickupArea.lng,
      },
    });

    const dropAddress = await prisma.address.create({
      data: {
        contactName,
        contactPhone: `+9198${Math.floor(10000000 + random() * 89999999)}`,
        line1: `${Math.floor(random() * 180) + 1}, ${dropArea.name} ${random() < 0.5 ? 'Cross' : 'Layout'}`,
        landmark: random() < 0.5 ? `Near ${dropArea.name} Metro` : null,
        city: dropArea.city,
        state: dropArea.state,
        pincode: dropArea.pincode,
        lat: dropArea.lat,
        lng: dropArea.lng,
      },
    });

    // Assign an agent for anything past CONFIRMED, preferring the pickup zone.
    const needsAgent = !['PENDING', 'CONFIRMED', 'CANCELLED', 'FAILED', 'RESCHEDULED'].includes(
      targetStatus,
    );
    const zoneAgents = agents.filter((a) => a.fixture.zoneCode === pickupArea.zoneCode);
    const chosenAgent = needsAgent ? (zoneAgents.length ? pick(zoneAgents) : pick(agents)) : null;

    const scheduledDate = new Date(createdAt);
    scheduledDate.setDate(scheduledDate.getDate() + (pickupArea.city === dropArea.city ? 1 : 3));

    const deliveredAt = targetStatus === 'DELIVERED' ? offset(createdAt, 6, 40) : null;
    const failedAt = targetStatus === 'FAILED' ? offset(createdAt, 6, 30) : null;

    const order = await prisma.order.create({
      data: {
        code: generateOrderCode(),
        customerId: customer.id,
        createdById: random() < 0.15 ? admin.id : customer.id,
        orderType,
        paymentType,
        declaredValue: round2(declaredValue),

        pickupAddressId: pickupAddress.id,
        dropAddressId: dropAddress.id,
        pickupZoneId: quote.zones.pickup.id,
        dropZoneId: quote.zones.drop.id,

        lengthCm,
        breadthCm,
        heightCm,
        actualWeightKg,
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

        status: targetStatus,
        agentId: chosenAgent?.profile.id ?? null,
        scheduledDate,
        pickedUpAt: ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(targetStatus)
          ? offset(createdAt, 2, 15)
          : null,
        deliveredAt,
        failedAt,
        failureReason:
          targetStatus === 'FAILED'
            ? pick(['Customer not available', 'Address not found / incorrect', 'COD amount not ready'])
            : null,
        attemptCount: targetStatus === 'FAILED' ? 1 : targetStatus === 'RESCHEDULED' ? 1 : 0,
        createdAt,
        updatedAt: deliveredAt ?? failedAt ?? createdAt,
      },
    });

    await writeHistory({
      orderId: order.id,
      targetStatus,
      createdAt,
      customerName: customer.fullName,
      customerId: customer.id,
      agentName: chosenAgent?.user.fullName ?? null,
      agentUserId: chosenAgent?.user.id ?? null,
      adminId: admin.id,
      failureReason: order.failureReason,
      route: `${quote.zones.pickup.name} → ${quote.zones.drop.name}`,
    });

    // Keep agent capacity consistent with the orders we just fabricated.
    if (chosenAgent && ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(targetStatus)) {
      await prisma.agentProfile.update({
        where: { id: chosenAgent.profile.id },
        data: { activeOrderCount: { increment: 1 }, totalAssigned: { increment: 1 } },
      });
      await prisma.assignmentHistory.create({
        data: {
          orderId: order.id,
          agentId: chosenAgent.profile.id,
          assignedById: admin.id,
          mode: random() < 0.6 ? 'AUTO' : 'MANUAL',
          reason: `${chosenAgent.user.fullName} selected — operates in the pickup zone`,
          distanceKm: between(0.6, 8.5, 2),
          score: between(0.62, 0.95, 3),
          createdAt: offset(createdAt, 0, 25),
        },
      });
    }

    if (targetStatus === 'RESCHEDULED') {
      const newDate = new Date();
      newDate.setDate(newDate.getDate() + 2);
      await prisma.rescheduleRequest.create({
        data: {
          orderId: order.id,
          requestedById: customer.id,
          previousDate: scheduledDate,
          newDate,
          reason: 'Nobody at home on the first attempt — please try after 6pm.',
          attemptNumber: 2,
          createdAt: offset(createdAt, 20, 0),
        },
      });
      await prisma.order.update({ where: { id: order.id }, data: { scheduledDate: newDate } });
    }

    created += 1;
  }

  log(`✓ ${created} demo orders with full tracking history`);
  await summary();
}

/**
 * Replay the status ladder up to the target so the timeline reads like a real
 * shipment rather than a single "created as DELIVERED" row.
 */
async function writeHistory(params: {
  orderId: string;
  targetStatus: OrderStatus;
  createdAt: Date;
  customerName: string;
  customerId: string;
  agentName: string | null;
  agentUserId: string | null;
  adminId: string;
  failureReason: string | null;
  route: string;
}): Promise<void> {
  const LADDER: OrderStatus[] = [
    'PENDING',
    'CONFIRMED',
    'ASSIGNED',
    'PICKED_UP',
    'IN_TRANSIT',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
  ];

  const path: OrderStatus[] =
    params.targetStatus === 'FAILED'
      ? ['PENDING', 'CONFIRMED', 'ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'FAILED']
      : params.targetStatus === 'RESCHEDULED'
        ? ['PENDING', 'CONFIRMED', 'ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'FAILED', 'RESCHEDULED']
        : params.targetStatus === 'CANCELLED'
          ? ['PENDING', 'CONFIRMED', 'CANCELLED']
          : LADDER.slice(0, LADDER.indexOf(params.targetStatus) + 1);

  // Space the ladder out naturally, then compress it if the natural spacing
  // would push the last event past "now" — a tracking event dated in the
  // future is the fastest way to make seeded data look fake.
  const naturalGaps = path.map(() => 45 + Math.floor(random() * 260));
  naturalGaps[0] = 0;

  const naturalSpanMin = naturalGaps.reduce((a, b) => a + b, 0);
  const availableMin = Math.max(
    15,
    Math.floor((Date.now() - params.createdAt.getTime()) / 60_000) - 5,
  );
  const scale = naturalSpanMin > availableMin ? availableMin / naturalSpanMin : 1;

  let previous: OrderStatus | null = null;
  let minutes = 0;
  let step = 0;

  for (const status of path) {
    minutes += Math.round(naturalGaps[step] * scale);
    step += 1;
    const actor = actorFor(status, params);

    await prisma.trackingEvent.create({
      data: {
        orderId: params.orderId,
        fromStatus: previous,
        toStatus: status,
        actorId: actor.id,
        actorRole: actor.role,
        actorName: actor.name,
        title:
          status === 'PENDING'
            ? 'Order placed'
            : status === 'ASSIGNED'
              ? `Auto-assigned to ${params.agentName ?? 'an agent'}`
              : ORDER_STATUS_META[status].label,
        notes:
          status === 'PENDING'
            ? params.route
            : status === 'FAILED'
              ? params.failureReason
              : status === 'RESCHEDULED'
                ? 'Customer selected a new delivery date'
                : ORDER_STATUS_META[status].description,
        createdAt: offset(params.createdAt, Math.floor(minutes / 60), minutes % 60),
      },
    });

    previous = status;
  }
}

function actorFor(
  status: OrderStatus,
  params: { customerId: string; customerName: string; agentUserId: string | null; agentName: string | null; adminId: string },
): { id: string | null; role: string; name: string } {
  if (status === 'PENDING' || status === 'CONFIRMED' || status === 'RESCHEDULED' || status === 'CANCELLED') {
    return { id: params.customerId, role: 'CUSTOMER', name: params.customerName };
  }
  if (status === 'ASSIGNED') {
    return { id: null, role: 'SYSTEM', name: 'Dispatch engine' };
  }
  return {
    id: params.agentUserId,
    role: 'AGENT',
    name: params.agentName ?? 'Delivery agent',
  };
}

/**
 * Shift a timestamp forward, but never past the present. Every value this
 * produces is a record of something that has already happened, so a future
 * date would be a lie.
 */
function offset(base: Date, hours: number, minutes: number): Date {
  const d = new Date(base);
  d.setHours(d.getHours() + hours, d.getMinutes() + minutes);
  return d.getTime() > Date.now() ? new Date(Date.now() - 60_000) : d;
}

async function summary(): Promise<void> {
  const [zones, areas, cards, users, orders, events] = await Promise.all([
    prisma.zone.count(),
    prisma.area.count(),
    prisma.rateCard.count(),
    prisma.user.count(),
    prisma.order.count(),
    prisma.trackingEvent.count(),
  ]);

  console.log(`
  ─────────────────────────────
  Database now holds
    zones ${zones} · pincodes ${areas} · rate cards ${cards}
    users ${users} · orders ${orders} · tracking events ${events}

  Sign in with
    \x1b[35madmin\x1b[0m     ${env.SEED_ADMIN_EMAIL} / ${env.SEED_ADMIN_PASSWORD}
    \x1b[36mcustomer\x1b[0m  customer@swiftroute.dev / ${env.SEED_DEMO_PASSWORD}
    \x1b[32magent\x1b[0m     agent@swiftroute.dev / ${env.SEED_DEMO_PASSWORD}
`);
}

/** True when the database has never been seeded — used by the boot sequence. */
export async function isEmpty(): Promise<boolean> {
  const users = await prisma.user.count().catch(() => -1);
  return users === 0;
}

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}
