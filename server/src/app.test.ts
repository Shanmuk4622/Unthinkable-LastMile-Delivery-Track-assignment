/**
 * API integration tests.
 *
 * These drive the real Express app in-process with supertest against the
 * seeded development database, so they assert the contract end to end:
 * envelope shape, authentication, role scoping and the live rate engine.
 *
 * They are deliberately READ-ONLY (plus login, which only issues a token).
 * A suite that mutates the database it shares with the running dev server is a
 * suite nobody trusts; the write paths are covered by the pure unit tests and
 * by the documented manual walkthrough in docs/TESTING.md.
 *
 * Skipped automatically when the database has not been seeded yet.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app';
import { prisma } from './config/prisma';

const app = createApp();

/**
 * Resolved with a top-level await, not in `beforeAll`: describe() bodies run at
 * collection time, which is *before* any hook fires, so a hook-assigned flag
 * would still be false when the tests are being registered.
 */
const seeded = await (async () => {
  try {
    return (await prisma.user.count()) > 0 && (await prisma.area.count()) > 0;
  } catch {
    return false;
  }
})();

if (!seeded) {
  console.warn('[tests] Database not seeded — skipping data-dependent cases. Run: npm run db:seed');
}

const whenSeeded = () => (seeded ? it : it.skip);

describe('GET /api/health', () => {
  it('reports the database and the notification transports', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.database).toBe('up');
    expect(response.body.data.notifications).toHaveProperty('email');
    expect(response.body.data.notifications).toHaveProperty('sms');
  });
});

describe('GET /api/meta', () => {
  it('hands the client every enum and the legal transition graph', async () => {
    const response = await request(app).get('/api/meta');

    expect(response.status).toBe(200);
    expect(response.body.data.orderStatuses).toContain('OUT_FOR_DELIVERY');
    expect(response.body.data.transitions.CONFIRMED).toContain('ASSIGNED');
    expect(response.body.data.rolePermittedTargets.AGENT).not.toContain('CONFIRMED');
    expect(Object.keys(response.body.data.statusMeta)).toHaveLength(
      response.body.data.orderStatuses.length,
    );
  });
});

describe('error envelope', () => {
  it('returns a stable code and message for an unknown route', async () => {
    const response = await request(app).get('/api/nope');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'ROUTE_NOT_FOUND' },
    });
  });

  it('rejects malformed JSON without leaking a stack to the client shape', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });
});

describe('authentication', () => {
  it('refuses an unauthenticated request to a protected route', async () => {
    const response = await request(app).get('/api/orders');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('refuses a garbage bearer token', async () => {
    const response = await request(app)
      .get('/api/orders')
      .set('Authorization', 'Bearer not-a-real-token');

    expect(response.status).toBe(401);
  });

  it('validates the login payload before touching the database', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: '' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.fields.length).toBeGreaterThan(0);
  });

  whenSeeded()('does not reveal whether an e-mail is registered', async () => {
    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'Whatever@123' });

    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@swiftroute.dev', password: 'Whatever@123' });

    expect(unknown.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    // Identical copy either way — the endpoint cannot be used to enumerate.
    expect(unknown.body.error.message).toBe(wrongPassword.body.error.message);
  });
});

describe('role-scoped access', () => {
  const login = async (email: string, password: string) => {
    const response = await request(app).post('/api/auth/login').send({ email, password });
    return response.body.data?.accessToken as string | undefined;
  };

  whenSeeded()('signs an admin in and scopes /api/orders to everything', async () => {
    const token = await login('admin@swiftroute.dev', 'Admin@123');
    expect(token).toBeTruthy();

    const response = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.pagination).toHaveProperty('total');
  });

  whenSeeded()('scopes /api/orders to the caller for a customer', async () => {
    const token = await login('customer@swiftroute.dev', 'Demo@123');
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    const response = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    for (const order of response.body.data) {
      expect(order.customerId).toBe(me.body.data.id);
    }
  });

  whenSeeded()('keeps a customer out of the admin surface', async () => {
    const token = await login('customer@swiftroute.dev', 'Demo@123');

    const users = await request(app).get('/api/users').set('Authorization', `Bearer ${token}`);
    const agents = await request(app).get('/api/agents').set('Authorization', `Bearer ${token}`);

    expect(users.status).toBe(403);
    expect(agents.status).toBe(403);
  });
});

describe('POST /api/pricing/quote', () => {
  whenSeeded()('prices an intra-zone COD shipment with a full breakdown', async () => {
    const response = await request(app).post('/api/pricing/quote').send({
      pickupPincode: '560034',
      dropPincode: '560011',
      lengthCm: 30,
      breadthCm: 20,
      heightCm: 15,
      actualWeightKg: 1.2,
      orderType: 'B2C',
      paymentType: 'COD',
      declaredValue: 4500,
    });

    expect(response.status).toBe(200);

    const quote = response.body.data;
    expect(quote.zones.scope).toBe('INTRA_ZONE');
    expect(quote.weights.volumetricKg).toBe(1.8);
    expect(quote.weights.billedOn).toBe('VOLUMETRIC');
    expect(quote.weights.chargeableKg).toBe(2);
    expect(quote.charges.codSurcharge).toBe(67.5);
    expect(quote.charges.total).toBe(223.49);
    // Every charge must carry its own explanation.
    expect(quote.lines.every((line: { formula: string }) => line.formula.length > 0)).toBe(true);
  });

  whenSeeded()('selects the lane-specific card over the generic one', async () => {
    const response = await request(app).post('/api/pricing/quote').send({
      pickupPincode: '560034',
      dropPincode: '500034',
      lengthCm: 25,
      breadthCm: 18,
      heightCm: 12,
      actualWeightKg: 2.4,
      orderType: 'B2C',
      paymentType: 'PREPAID',
    });

    expect(response.status).toBe(200);
    expect(response.body.data.zones.scope).toBe('INTER_ZONE');
    expect(response.body.data.rateCard.laneSpecific).toBe(true);
  });

  whenSeeded()('refuses an unserviceable pincode with actionable copy', async () => {
    const response = await request(app).post('/api/pricing/quote').send({
      pickupPincode: '999999',
      dropPincode: '560034',
      lengthCm: 10,
      breadthCm: 10,
      heightCm: 10,
      actualWeightKg: 1,
      orderType: 'B2C',
      paymentType: 'PREPAID',
    });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('ZONE_NOT_SERVICEABLE');
    expect(response.body.error.message).toContain('999999');
  });

  it('rejects impossible package dimensions', async () => {
    const response = await request(app).post('/api/pricing/quote').send({
      pickupPincode: '560034',
      dropPincode: '560011',
      lengthCm: 0,
      breadthCm: -5,
      heightCm: 15,
      actualWeightKg: 0,
      orderType: 'B2C',
      paymentType: 'PREPAID',
    });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('public tracking', () => {
  it('404s an unknown tracking code', async () => {
    const response = await request(app).get('/api/tracking/SR-DOESNOTEXIST');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  whenSeeded()('exposes the timeline without leaking personal data', async () => {
    const order = await prisma.order.findFirst({ select: { code: true } });
    const response = await request(app).get(`/api/tracking/${order!.code}`);

    expect(response.status).toBe(200);

    const data = response.body.data;
    expect(data.trackingEvents.length).toBeGreaterThan(0);
    expect(data.progress).toHaveProperty('step');

    // Redaction: cities yes, street addresses / phones / pricing no.
    expect(data.pickupAddress).not.toHaveProperty('line1');
    expect(data.pickupAddress).not.toHaveProperty('contactPhone');
    expect(data).not.toHaveProperty('totalCharge');
    expect(data).not.toHaveProperty('declaredValue');
    // Only a first name is returned.
    expect(data.customer.fullName.split(' ')).toHaveLength(1);
  });
});

describe('zone serviceability', () => {
  whenSeeded()('confirms a mapped pincode and names its zone', async () => {
    const response = await request(app).get('/api/zones/serviceability/560034');

    expect(response.status).toBe(200);
    expect(response.body.data.serviceable).toBe(true);
    expect(response.body.data.zone.code).toBe('BLR-S');
  });

  it('reports an unmapped pincode as unserviceable rather than erroring', async () => {
    const response = await request(app).get('/api/zones/serviceability/999999');

    expect(response.status).toBe(200);
    expect(response.body.data.serviceable).toBe(false);
    expect(response.body.data.zone).toBeNull();
  });
});
