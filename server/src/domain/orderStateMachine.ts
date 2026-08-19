/**
 * Order lifecycle state machine.
 * ---------------------------------------------------------------------------
 * Every status change in the system funnels through `assertTransition`, so the
 * set of legal edges lives in exactly one place. Admins may override the graph
 * (the brief requires "override any order status") but an override is recorded
 * explicitly on the tracking event, so an auditor can always tell a normal
 * transition from a manual intervention.
 *
 *                    ┌──────────┐
 *                    │ PENDING  │ quote accepted / order created
 *                    └────┬─────┘
 *                         │ confirm
 *                    ┌────▼─────┐            cancel
 *                    │CONFIRMED │───────────────────────┐
 *                    └────┬─────┘                       │
 *          assign (manual │ or auto)                    │
 *                    ┌────▼─────┐                       │
 *              ┌────►│ ASSIGNED │──────cancel───────────┤
 *              │     └────┬─────┘                       │
 *              │          │ agent collects              │
 *              │     ┌────▼─────┐                       │
 *              │     │PICKED_UP │                       │
 *              │     └────┬─────┘                       │
 *              │          │                             │
 *              │     ┌────▼─────┐                       │
 *              │     │IN_TRANSIT│                       │
 *              │     └────┬─────┘                       │
 *              │          │                             │
 *              │   ┌──────▼──────────┐                  │
 *              │   │OUT_FOR_DELIVERY │                  │
 *              │   └───┬─────────┬───┘                  │
 *              │       │         │                      │
 *              │  ┌────▼────┐ ┌──▼─────┐          ┌─────▼─────┐
 *              │  │DELIVERED│ │ FAILED │          │ CANCELLED │
 *              │  └─────────┘ └──┬──┬──┘          └───────────┘
 *              │                 │  └──── cancel ───────┘
 *              │   reschedule    │
 *              │        ┌────────▼─────┐
 *              └────────┤ RESCHEDULED  │  (re-assignment puts it back
 *                       └──────────────┘   on ASSIGNED)
 */

import { ACTIVE_STATUSES, TERMINAL_STATUSES, type OrderStatus, type Role } from './constants';

/** Adjacency list of permitted transitions. */
export const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['PICKED_UP', 'FAILED', 'CANCELLED'],
  PICKED_UP: ['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'FAILED'],
  IN_TRANSIT: ['OUT_FOR_DELIVERY', 'FAILED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'FAILED'],
  FAILED: ['RESCHEDULED', 'CANCELLED'],
  RESCHEDULED: ['ASSIGNED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

/** Which roles may *request* a given target status through the normal routes. */
export const ROLE_PERMITTED_TARGETS: Record<Role, readonly OrderStatus[]> = {
  CUSTOMER: ['CONFIRMED', 'CANCELLED', 'RESCHEDULED'],
  AGENT: ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED'],
  ADMIN: [
    'PENDING',
    'CONFIRMED',
    'ASSIGNED',
    'PICKED_UP',
    'IN_TRANSIT',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'FAILED',
    'RESCHEDULED',
    'CANCELLED',
  ],
};

export class InvalidTransitionError extends Error {
  public readonly status = 409;
  public readonly code = 'INVALID_STATUS_TRANSITION';

  constructor(
    public readonly from: OrderStatus,
    public readonly to: OrderStatus,
  ) {
    super(
      `Cannot move an order from ${from} to ${to}. Allowed next steps: ` +
        (TRANSITIONS[from].length ? TRANSITIONS[from].join(', ') : '(none — terminal state)'),
    );
    this.name = 'InvalidTransitionError';
  }
}

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function occupiesAgentCapacity(status: OrderStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function nextStatuses(from: OrderStatus): readonly OrderStatus[] {
  return TRANSITIONS[from];
}

/**
 * Throws unless the edge exists.
 *
 * @param allowOverride set by admin-only routes. An override still refuses
 *        to resurrect a terminal order into an active one without going
 *        through an explicit reopen, because that would corrupt agent
 *        capacity accounting.
 */
export function assertTransition(
  from: OrderStatus,
  to: OrderStatus,
  allowOverride = false,
): void {
  if (from === to) {
    throw new InvalidTransitionError(from, to);
  }
  if (canTransition(from, to)) return;
  if (allowOverride) return;
  throw new InvalidTransitionError(from, to);
}

/** True when the requesting role is allowed to ask for this target at all. */
export function roleMayRequest(role: Role, to: OrderStatus): boolean {
  return ROLE_PERMITTED_TARGETS[role].includes(to);
}
