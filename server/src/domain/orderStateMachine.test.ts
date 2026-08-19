/**
 * Lifecycle invariants.
 *
 * The state machine is what stops an order being marked delivered twice, or
 * resurrected out of a terminal state, so its edges are asserted explicitly
 * rather than trusted.
 */
import { describe, expect, it } from 'vitest';
import {
  InvalidTransitionError,
  TRANSITIONS,
  assertTransition,
  canTransition,
  isTerminal,
  nextStatuses,
  occupiesAgentCapacity,
  roleMayRequest,
} from './orderStateMachine';
import { ORDER_STATUSES, type OrderStatus } from './constants';

describe('transition graph', () => {
  it('defines edges for every declared status', () => {
    for (const status of ORDER_STATUSES) {
      expect(TRANSITIONS[status]).toBeDefined();
    }
  });

  it('walks the happy path end to end', () => {
    const path: OrderStatus[] = [
      'PENDING',
      'CONFIRMED',
      'ASSIGNED',
      'PICKED_UP',
      'IN_TRANSIT',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
    ];
    for (let i = 0; i < path.length - 1; i += 1) {
      expect(canTransition(path[i], path[i + 1])).toBe(true);
    }
  });

  it('allows an order to skip straight to out-for-delivery after pickup', () => {
    // Same-zone deliveries often never enter a hub.
    expect(canTransition('PICKED_UP', 'OUT_FOR_DELIVERY')).toBe(true);
  });

  it('refuses to move backwards', () => {
    expect(canTransition('DELIVERED', 'IN_TRANSIT')).toBe(false);
    expect(canTransition('OUT_FOR_DELIVERY', 'PICKED_UP')).toBe(false);
    expect(canTransition('ASSIGNED', 'CONFIRMED')).toBe(false);
  });

  it('treats DELIVERED and CANCELLED as terminal', () => {
    expect(isTerminal('DELIVERED')).toBe(true);
    expect(isTerminal('CANCELLED')).toBe(true);
    expect(nextStatuses('DELIVERED')).toHaveLength(0);
    expect(nextStatuses('CANCELLED')).toHaveLength(0);
  });

  it('does not treat FAILED as terminal — it is recoverable', () => {
    expect(isTerminal('FAILED')).toBe(false);
    expect(canTransition('FAILED', 'RESCHEDULED')).toBe(true);
  });

  it('routes a rescheduled order back to a fresh assignment', () => {
    expect(canTransition('RESCHEDULED', 'ASSIGNED')).toBe(true);
  });
});

describe('assertTransition', () => {
  it('passes a legal edge silently', () => {
    expect(() => assertTransition('CONFIRMED', 'ASSIGNED')).not.toThrow();
  });

  it('throws with an actionable message on an illegal edge', () => {
    expect(() => assertTransition('PENDING', 'DELIVERED')).toThrow(InvalidTransitionError);
    try {
      assertTransition('PENDING', 'DELIVERED');
    } catch (error) {
      expect((error as InvalidTransitionError).status).toBe(409);
      expect((error as Error).message).toContain('CONFIRMED');
    }
  });

  it('rejects a no-op transition', () => {
    expect(() => assertTransition('ASSIGNED', 'ASSIGNED')).toThrow(InvalidTransitionError);
  });

  it('lets an admin override an illegal edge', () => {
    expect(() => assertTransition('PENDING', 'DELIVERED', true)).not.toThrow();
  });

  it('still refuses a no-op even under override', () => {
    expect(() => assertTransition('DELIVERED', 'DELIVERED', true)).toThrow();
  });
});

describe('agent capacity accounting', () => {
  it('counts only the statuses where an agent is physically holding the parcel', () => {
    expect(occupiesAgentCapacity('ASSIGNED')).toBe(true);
    expect(occupiesAgentCapacity('PICKED_UP')).toBe(true);
    expect(occupiesAgentCapacity('IN_TRANSIT')).toBe(true);
    expect(occupiesAgentCapacity('OUT_FOR_DELIVERY')).toBe(true);
  });

  it('frees capacity once the attempt has resolved', () => {
    expect(occupiesAgentCapacity('DELIVERED')).toBe(false);
    expect(occupiesAgentCapacity('FAILED')).toBe(false);
    expect(occupiesAgentCapacity('CANCELLED')).toBe(false);
    expect(occupiesAgentCapacity('RESCHEDULED')).toBe(false);
    expect(occupiesAgentCapacity('CONFIRMED')).toBe(false);
  });
});

describe('role permissions', () => {
  it('lets an agent drive the delivery statuses only', () => {
    expect(roleMayRequest('AGENT', 'PICKED_UP')).toBe(true);
    expect(roleMayRequest('AGENT', 'DELIVERED')).toBe(true);
    expect(roleMayRequest('AGENT', 'FAILED')).toBe(true);
    expect(roleMayRequest('AGENT', 'CONFIRMED')).toBe(false);
    expect(roleMayRequest('AGENT', 'CANCELLED')).toBe(false);
  });

  it('keeps a customer away from the courier statuses', () => {
    expect(roleMayRequest('CUSTOMER', 'CONFIRMED')).toBe(true);
    expect(roleMayRequest('CUSTOMER', 'CANCELLED')).toBe(true);
    expect(roleMayRequest('CUSTOMER', 'RESCHEDULED')).toBe(true);
    expect(roleMayRequest('CUSTOMER', 'DELIVERED')).toBe(false);
    expect(roleMayRequest('CUSTOMER', 'PICKED_UP')).toBe(false);
  });

  it('gives an admin every target, as the brief requires', () => {
    for (const status of ORDER_STATUSES) {
      expect(roleMayRequest('ADMIN', status)).toBe(true);
    }
  });
});
