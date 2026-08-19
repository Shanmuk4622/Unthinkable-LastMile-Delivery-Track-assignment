/**
 * Domain constants — the single source of truth for every enumerated value in
 * the system.
 *
 * SQLite has no native ENUM type, so these live in code rather than in the
 * database. Everything that can produce or consume one of these values (Zod
 * validators, the state machine, the React client's typings) derives from this
 * file, which means adding a status is a one-line change that the compiler then
 * propagates for us.
 */

// ---------------------------------------------------------------------------
//  Roles
// ---------------------------------------------------------------------------

export const ROLES = ['CUSTOMER', 'AGENT', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

/** SYSTEM is never a login role — it is only ever an actor on a tracking event. */
export const ACTOR_ROLES = [...ROLES, 'SYSTEM'] as const;
export type ActorRole = (typeof ACTOR_ROLES)[number];

// ---------------------------------------------------------------------------
//  Orders
// ---------------------------------------------------------------------------

export const ORDER_TYPES = ['B2B', 'B2C'] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export const PAYMENT_TYPES = ['PREPAID', 'COD'] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];

export const ORDER_STATUSES = [
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
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Statuses an order can never leave. */
export const TERMINAL_STATUSES: readonly OrderStatus[] = ['DELIVERED', 'CANCELLED'];

/** Statuses that occupy an agent's capacity. */
export const ACTIVE_STATUSES: readonly OrderStatus[] = [
  'ASSIGNED',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
];

/** Statuses a delivery agent is allowed to move an order into. */
export const AGENT_SETTABLE_STATUSES: readonly OrderStatus[] = [
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'FAILED',
];

/** Presentation metadata shared with the client via GET /api/meta. */
export const ORDER_STATUS_META: Record<
  OrderStatus,
  { label: string; description: string; tone: string; icon: string; step: number }
> = {
  PENDING: {
    label: 'Pending',
    description: 'Quote generated, awaiting confirmation.',
    tone: 'slate',
    icon: 'clock',
    step: 0,
  },
  CONFIRMED: {
    label: 'Confirmed',
    description: 'Order booked and waiting for an agent.',
    tone: 'violet',
    icon: 'check-circle',
    step: 1,
  },
  ASSIGNED: {
    label: 'Agent assigned',
    description: 'A delivery agent is on the way to pick up.',
    tone: 'blue',
    icon: 'user-check',
    step: 2,
  },
  PICKED_UP: {
    label: 'Picked up',
    description: 'Parcel collected from the pickup address.',
    tone: 'cyan',
    icon: 'package-check',
    step: 3,
  },
  IN_TRANSIT: {
    label: 'In transit',
    description: 'Moving through the network.',
    tone: 'indigo',
    icon: 'truck',
    step: 4,
  },
  OUT_FOR_DELIVERY: {
    label: 'Out for delivery',
    description: 'On the final leg to the drop address.',
    tone: 'amber',
    icon: 'navigation',
    step: 5,
  },
  DELIVERED: {
    label: 'Delivered',
    description: 'Handed over successfully.',
    tone: 'emerald',
    icon: 'party-popper',
    step: 6,
  },
  FAILED: {
    label: 'Delivery failed',
    description: 'Attempt unsuccessful — reschedule available.',
    tone: 'rose',
    icon: 'alert-triangle',
    step: 6,
  },
  RESCHEDULED: {
    label: 'Rescheduled',
    description: 'New delivery date captured, re-assignment pending.',
    tone: 'orange',
    icon: 'calendar-clock',
    step: 2,
  },
  CANCELLED: {
    label: 'Cancelled',
    description: 'Order cancelled.',
    tone: 'zinc',
    icon: 'x-circle',
    step: 6,
  },
};

/** The happy path, used by the client to render the progress rail. */
export const HAPPY_PATH: readonly OrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'ASSIGNED',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

// ---------------------------------------------------------------------------
//  Agents
// ---------------------------------------------------------------------------

export const AGENT_AVAILABILITY = ['AVAILABLE', 'BUSY', 'ON_BREAK', 'OFFLINE'] as const;
export type AgentAvailability = (typeof AGENT_AVAILABILITY)[number];

export const VEHICLE_TYPES = ['BIKE', 'SCOOTER', 'VAN', 'TRUCK'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

/** Upper bound on the billable weight each vehicle class may carry, in kg. */
export const VEHICLE_CAPACITY_KG: Record<VehicleType, number> = {
  BIKE: 15,
  SCOOTER: 25,
  VAN: 500,
  TRUCK: 5000,
};

// ---------------------------------------------------------------------------
//  Pricing
// ---------------------------------------------------------------------------

export const RATE_SCOPES = ['INTRA_ZONE', 'INTER_ZONE'] as const;
export type RateScope = (typeof RATE_SCOPES)[number];

// ---------------------------------------------------------------------------
//  Assignment
// ---------------------------------------------------------------------------

export const ASSIGNMENT_MODES = ['AUTO', 'MANUAL', 'REASSIGN'] as const;
export type AssignmentMode = (typeof ASSIGNMENT_MODES)[number];

// ---------------------------------------------------------------------------
//  Notifications
// ---------------------------------------------------------------------------

export const NOTIFICATION_CHANNELS = ['EMAIL', 'SMS'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_STATUSES = ['QUEUED', 'SENT', 'FAILED', 'SKIPPED'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

// ---------------------------------------------------------------------------
//  Failure reasons offered to agents (free text is also accepted)
// ---------------------------------------------------------------------------

export const FAILURE_REASONS = [
  'Customer not available',
  'Address not found / incorrect',
  'Customer refused delivery',
  'COD amount not ready',
  'Premises closed',
  'Unreachable by phone',
  'Weather / road blocked',
  'Damaged in transit',
] as const;
