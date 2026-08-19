/**
 * Dispatch scoring tests.
 *
 * The four signal functions are pure, so the ranking behaviour that actually
 * matters — "does a slightly-further but idle agent beat a saturated one right
 * outside the door?" — can be asserted without a database.
 */
import { describe, expect, it } from 'vitest';
import {
  canCarry,
  performanceSignal,
  proximitySignal,
  workloadSignal,
  zoneSignal,
} from './assignmentEngine';
import { estimatedMinutes, haversineKm } from '../utils/geo';

describe('proximitySignal', () => {
  it('is 1 when the agent is standing on the pickup point', () => {
    expect(proximitySignal(0, 25)).toBe(1);
  });

  it('decays linearly to 0 at the service radius', () => {
    expect(proximitySignal(12.5, 25)).toBeCloseTo(0.5, 5);
    expect(proximitySignal(25, 25)).toBe(0);
  });

  it('never goes negative beyond the radius', () => {
    expect(proximitySignal(120, 25)).toBe(0);
  });

  it('scores an unlocatable agent 0 rather than crashing', () => {
    expect(proximitySignal(null, 25)).toBe(0);
  });
});

describe('zoneSignal', () => {
  it('rewards an agent who works the pickup zone', () => {
    expect(zoneSignal('zone-a', 'zone-a', 'zone-b')).toBe(1);
  });

  it('gives partial credit for owning the drop zone', () => {
    expect(zoneSignal('zone-b', 'zone-a', 'zone-b')).toBe(0.4);
  });

  it('scores an unrelated zone 0', () => {
    expect(zoneSignal('zone-c', 'zone-a', 'zone-b')).toBe(0);
  });

  it('scores a zoneless agent 0 without throwing', () => {
    expect(zoneSignal(null, 'zone-a', 'zone-b')).toBe(0);
  });
});

describe('workloadSignal', () => {
  it('is 1 for a completely free agent', () => {
    expect(workloadSignal(0, 5)).toBe(1);
  });

  it('is 0 for an agent at capacity', () => {
    expect(workloadSignal(5, 5)).toBe(0);
  });

  it('scales linearly in between', () => {
    expect(workloadSignal(2, 5)).toBeCloseTo(0.6, 5);
  });

  it('cannot go negative if accounting ever overshoots', () => {
    expect(workloadSignal(9, 5)).toBe(0);
  });
});

describe('performanceSignal', () => {
  it('gives a new agent a neutral score rather than a cold-start penalty', () => {
    // A brand-new agent scoring 0 would be starved of the very orders they
    // need to build a record.
    const score = performanceSignal({ totalDelivered: 0, totalFailed: 0, ratingAvg: 5 });
    expect(score).toBeCloseTo(0.86, 2);
  });

  it('rewards a strong delivery record', () => {
    const strong = performanceSignal({ totalDelivered: 200, totalFailed: 2, ratingAvg: 4.9 });
    const weak = performanceSignal({ totalDelivered: 40, totalFailed: 40, ratingAvg: 3 });
    expect(strong).toBeGreaterThan(weak);
    expect(strong).toBeGreaterThan(0.9);
  });

  it('stays within [0, 1]', () => {
    const score = performanceSignal({ totalDelivered: 0, totalFailed: 100, ratingAvg: 0 });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe('vehicle capacity filter', () => {
  it('keeps a heavy shipment off a bike', () => {
    expect(canCarry('BIKE', 40)).toBe(false);
    expect(canCarry('BIKE', 8)).toBe(true);
  });

  it('lets a truck take anything reasonable', () => {
    expect(canCarry('TRUCK', 900)).toBe(true);
  });

  it('does not block dispatch on an unknown vehicle class', () => {
    expect(canCarry('HOVERBOARD', 900)).toBe(true);
  });
});

describe('combined ranking behaviour', () => {
  const WEIGHTS = { distance: 0.5, zone: 0.25, workload: 0.15, performance: 0.1 };

  const score = (c: {
    distanceKm: number;
    agentZone: string | null;
    active: number;
    capacity: number;
    delivered: number;
    failed: number;
  }) =>
    WEIGHTS.distance * proximitySignal(c.distanceKm, 25) +
    WEIGHTS.zone * zoneSignal(c.agentZone, 'pickup-zone', 'drop-zone') +
    WEIGHTS.workload * workloadSignal(c.active, c.capacity) +
    WEIGHTS.performance *
      performanceSignal({ totalDelivered: c.delivered, totalFailed: c.failed, ratingAvg: 4.8 });

  it('prefers an idle in-zone agent over a saturated one that is marginally closer', () => {
    const saturated = score({
      distanceKm: 0.5,
      agentZone: 'pickup-zone',
      active: 5,
      capacity: 5,
      delivered: 100,
      failed: 5,
    });
    const idle = score({
      distanceKm: 3,
      agentZone: 'pickup-zone',
      active: 0,
      capacity: 5,
      delivered: 100,
      failed: 5,
    });
    expect(idle).toBeGreaterThan(saturated);
  });

  it('still prefers the near agent when workloads match', () => {
    const near = score({ distanceKm: 1, agentZone: 'pickup-zone', active: 1, capacity: 5, delivered: 50, failed: 2 });
    const far = score({ distanceKm: 18, agentZone: 'pickup-zone', active: 1, capacity: 5, delivered: 50, failed: 2 });
    expect(near).toBeGreaterThan(far);
  });

  it('lets zone familiarity break a near-tie on distance', () => {
    const inZone = score({ distanceKm: 6, agentZone: 'pickup-zone', active: 1, capacity: 5, delivered: 50, failed: 2 });
    const outOfZone = score({ distanceKm: 5, agentZone: 'other-zone', active: 1, capacity: 5, delivered: 50, failed: 2 });
    expect(inZone).toBeGreaterThan(outOfZone);
  });

  it('produces a score inside [0, 1] for any input', () => {
    const best = score({ distanceKm: 0, agentZone: 'pickup-zone', active: 0, capacity: 5, delivered: 500, failed: 0 });
    const worst = score({ distanceKm: 25, agentZone: null, active: 5, capacity: 5, delivered: 0, failed: 50 });
    expect(best).toBeLessThanOrEqual(1);
    expect(worst).toBeGreaterThanOrEqual(0);
    expect(best).toBeGreaterThan(worst);
  });
});

describe('geo helpers', () => {
  it('measures a known Bengaluru distance sensibly', () => {
    // Koramangala -> Whitefield is roughly 13 km as the crow flies.
    const km = haversineKm({ lat: 12.9352, lng: 77.6245 }, { lat: 12.9698, lng: 77.7499 });
    expect(km).toBeGreaterThan(12);
    expect(km).toBeLessThan(16);
  });

  it('returns 0 for the same point', () => {
    expect(haversineKm({ lat: 12.9, lng: 77.6 }, { lat: 12.9, lng: 77.6 })).toBe(0);
  });

  it('gives an ETA that includes a handling allowance', () => {
    expect(estimatedMinutes(0)).toBeGreaterThan(0);
    expect(estimatedMinutes(11)).toBeGreaterThan(estimatedMinutes(2));
  });
});
