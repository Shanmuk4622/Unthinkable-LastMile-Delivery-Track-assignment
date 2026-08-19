/**
 * Client-side mirrors of the API payloads.
 *
 * These are kept deliberately narrow: only the fields the UI actually reads.
 * The enumerated unions match server/src/domain/constants.ts one for one.
 */

export type Role = 'CUSTOMER' | 'AGENT' | 'ADMIN';
export type ActorRole = Role | 'SYSTEM';
export type OrderType = 'B2B' | 'B2C';
export type PaymentType = 'PREPAID' | 'COD';
export type RateScope = 'INTRA_ZONE' | 'INTER_ZONE';
export type AgentAvailability = 'AVAILABLE' | 'BUSY' | 'ON_BREAK' | 'OFFLINE';
export type VehicleType = 'BIKE' | 'SCOOTER' | 'VAN' | 'TRUCK';

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'ASSIGNED'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'FAILED'
  | 'RESCHEDULED'
  | 'CANCELLED';

// ---------------------------------------------------------------------------
//  Envelope
// ---------------------------------------------------------------------------

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message?: string;
  pagination?: Pagination;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiErrorShape {
  code: string;
  message: string;
  details?: {
    fields?: Array<{ path: string; message: string }>;
    [key: string]: unknown;
  };
}

// ---------------------------------------------------------------------------
//  Identity
// ---------------------------------------------------------------------------

export interface AgentProfileSummary {
  id: string;
  availability: AgentAvailability;
  vehicleType: VehicleType;
  vehicleNumber: string | null;
  zoneId: string | null;
  activeOrderCount: number;
  maxConcurrentOrders: number;
  currentLat: number | null;
  currentLng: number | null;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: Role;
  companyName: string | null;
  isActive: boolean;
  createdAt: string;
  agentProfile?: AgentProfileSummary | null;
  _count?: { orders: number };
}

export interface AuthResult {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

// ---------------------------------------------------------------------------
//  Geography
// ---------------------------------------------------------------------------

export interface Zone {
  id: string;
  code: string;
  name: string;
  city: string;
  state: string | null;
  description: string | null;
  centerLat: number | null;
  centerLng: number | null;
  isActive: boolean;
  areas?: Area[];
  _count?: { areas: number; agents: number; pickupOrders: number; dropOrders: number };
}

export interface Area {
  id: string;
  pincode: string;
  name: string;
  city: string;
  state: string | null;
  zoneId: string;
  lat: number | null;
  lng: number | null;
  isActive: boolean;
  zone?: Pick<Zone, 'id' | 'code' | 'name' | 'city'>;
}

export interface Serviceability {
  pincode: string;
  serviceable: boolean;
  zone: Pick<Zone, 'id' | 'code' | 'name' | 'city'> | null;
  area: { name: string; city: string } | null;
}

export interface Address {
  id: string;
  label: string | null;
  contactName: string;
  contactPhone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string | null;
  pincode: string;
  lat: number | null;
  lng: number | null;
}

/** What the booking form collects, before an id exists. */
export type AddressInput = Omit<Address, 'id'>;

// ---------------------------------------------------------------------------
//  Pricing
// ---------------------------------------------------------------------------

export interface PricingSettings {
  id: string;
  volumetricDivisor: number;
  weightRoundingKg: number;
  minChargeableWeightKg: number;
  currency: string;
}

export interface RateCard {
  id: string;
  name: string;
  orderType: OrderType;
  scope: RateScope;
  fromZoneId: string | null;
  toZoneId: string | null;
  baseWeightKg: number;
  basePrice: number;
  incrementalWeightKg: number;
  incrementalPrice: number;
  fuelSurchargePct: number;
  gstPct: number;
  handlingFee: number;
  priority: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  fromZone?: Pick<Zone, 'id' | 'code' | 'name'> | null;
  toZone?: Pick<Zone, 'id' | 'code' | 'name'> | null;
  _count?: { orders: number };
}

export interface CodRule {
  id: string;
  orderType: OrderType;
  flatFee: number;
  percentOfValue: number;
  minFee: number;
  maxFee: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
}

export interface RateLine {
  key: string;
  label: string;
  formula: string;
  amount: number;
  kind: 'charge' | 'tax' | 'info';
}

export interface Quote {
  currency: string;
  zones: {
    pickup: Pick<Zone, 'id' | 'code' | 'name' | 'city'>;
    drop: Pick<Zone, 'id' | 'code' | 'name' | 'city'>;
    scope: RateScope;
    sameZone: boolean;
  };
  weights: {
    actualKg: number;
    volumetricKg: number;
    billedOn: 'ACTUAL' | 'VOLUMETRIC';
    chargeableKg: number;
    volumetricDivisor: number;
    slabKg: number;
    extraSlabs: number;
  };
  rateCard: {
    id: string;
    name: string;
    orderType: OrderType;
    scope: RateScope;
    baseWeightKg: number;
    basePrice: number;
    incrementalWeightKg: number;
    incrementalPrice: number;
    laneSpecific: boolean;
  };
  charges: {
    baseCharge: number;
    weightCharge: number;
    handlingFee: number;
    fuelSurcharge: number;
    codSurcharge: number;
    taxableAmount: number;
    taxAmount: number;
    gstPct: number;
    total: number;
  };
  lines: RateLine[];
  meta: { calculatedAt: string; engineVersion: string; codRuleId: string | null };
}

export interface QuoteInput {
  pickupPincode: string;
  dropPincode: string;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
  actualWeightKg: number;
  orderType: OrderType;
  paymentType: PaymentType;
  declaredValue?: number;
}

// ---------------------------------------------------------------------------
//  Orders
// ---------------------------------------------------------------------------

export interface OrderAgent {
  id: string;
  vehicleType: VehicleType;
  vehicleNumber: string | null;
  availability: AgentAvailability;
  currentLat: number | null;
  currentLng: number | null;
  user: { id: string; fullName: string; email: string; phone: string | null };
  zone: { id: string; code: string; name: string } | null;
}

export interface TrackingEvent {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actorId: string | null;
  actorRole: ActorRole;
  actorName: string;
  title: string;
  notes: string | null;
  lat: number | null;
  lng: number | null;
  metadata: string | null;
  createdAt: string;
}

export interface Order {
  id: string;
  code: string;
  customerId: string;
  orderType: OrderType;
  paymentType: PaymentType;
  declaredValue: number;

  lengthCm: number;
  breadthCm: number;
  heightCm: number;
  actualWeightKg: number;
  volumetricWeightKg: number;
  chargeableWeightKg: number;

  baseCharge: number;
  weightCharge: number;
  handlingFee: number;
  fuelSurcharge: number;
  codSurcharge: number;
  taxAmount: number;
  totalCharge: number;
  currency: string;
  pricingBreakdown: Quote | null;

  status: OrderStatus;
  agentId: string | null;
  scheduledDate: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  attemptCount: number;
  cancelReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;

  customer: { id: string; fullName: string; email: string; phone: string | null; companyName: string | null };
  createdBy: { id: string; fullName: string; role: Role };
  pickupAddress: Address;
  dropAddress: Address;
  pickupZone: Pick<Zone, 'id' | 'code' | 'name' | 'city'> | null;
  dropZone: Pick<Zone, 'id' | 'code' | 'name' | 'city'> | null;
  rateCard: Pick<RateCard, 'id' | 'name' | 'orderType' | 'scope'> | null;
  agent: OrderAgent | null;

  trackingEvents?: TrackingEvent[];
  allowedNextStatuses?: OrderStatus[];
}

export interface CreateOrderInput {
  customerId?: string;
  orderType: OrderType;
  paymentType: PaymentType;
  declaredValue?: number;
  pickup: AddressInput;
  drop: AddressInput;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
  actualWeightKg: number;
  scheduledDate?: string | null;
  notes?: string | null;
  confirmImmediately?: boolean;
  autoAssign?: boolean;
}

export interface OrderFilters {
  status?: OrderStatus | '';
  zoneId?: string;
  agentId?: string;
  customerId?: string;
  orderType?: OrderType | '';
  paymentType?: PaymentType | '';
  search?: string;
  sort?: 'newest' | 'oldest' | 'value';
  page?: number;
  pageSize?: number;
}

// ---------------------------------------------------------------------------
//  Dispatch
// ---------------------------------------------------------------------------

export interface ScoredCandidate {
  agentId: string;
  agentName: string;
  vehicleType: VehicleType;
  zoneCode: string | null;
  availability: AgentAvailability;
  activeOrders: number;
  maxConcurrentOrders: number;
  distanceKm: number | null;
  etaMinutes: number | null;
  signals: { proximity: number; zoneMatch: number; workload: number; performance: number };
  score: number;
  rejectedBecause: string | null;
}

export interface AssignmentDecision {
  chosen: ScoredCandidate | null;
  ranked: ScoredCandidate[];
  rejected: ScoredCandidate[];
  widenedSearch: boolean;
  reason: string;
}

export interface AgentProfile {
  id: string;
  userId: string;
  vehicleType: VehicleType;
  vehicleNumber: string | null;
  zoneId: string | null;
  availability: AgentAvailability;
  currentLat: number | null;
  currentLng: number | null;
  lastLocationAt: string | null;
  maxConcurrentOrders: number;
  activeOrderCount: number;
  totalAssigned: number;
  totalDelivered: number;
  totalFailed: number;
  ratingAvg: number;
  user: { id: string; fullName: string; email: string; phone: string | null; isActive: boolean };
  zone: Pick<Zone, 'id' | 'code' | 'name' | 'city'> | null;
  today?: { active: number; deliveredToday: number; failedToday: number };
}

export interface AssignmentRecord {
  id: string;
  mode: 'AUTO' | 'MANUAL' | 'REASSIGN';
  reason: string | null;
  distanceKm: number | null;
  score: number | null;
  candidateSnapshot: ScoredCandidate[] | null;
  unassignedAt: string | null;
  createdAt: string;
  agent: { id: string; user: { fullName: string; phone: string | null } };
  assignedBy: { fullName: string; role: Role } | null;
}

// ---------------------------------------------------------------------------
//  Notifications, tracking, analytics
// ---------------------------------------------------------------------------

export interface NotificationRecord {
  id: string;
  orderId: string | null;
  userId: string | null;
  channel: 'EMAIL' | 'SMS';
  recipient: string;
  subject: string | null;
  body: string;
  html: string | null;
  status: 'QUEUED' | 'SENT' | 'FAILED' | 'SKIPPED';
  provider: string | null;
  error: string | null;
  attempts: number;
  sentAt: string | null;
  createdAt: string;
  order?: { id: string; code: string; status: OrderStatus } | null;
  user?: { fullName: string; email: string } | null;
}

export interface PublicTracking {
  code: string;
  status: OrderStatus;
  orderType: OrderType;
  paymentType: PaymentType;
  createdAt: string;
  scheduledDate: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  attemptCount: number;
  chargeableWeightKg: number;
  customer: { fullName: string };
  pickupAddress: { city: string; state: string | null; pincode: string };
  dropAddress: { city: string; state: string | null; pincode: string };
  pickupZone: { code: string; name: string } | null;
  dropZone: { code: string; name: string } | null;
  agent: { vehicleType: VehicleType; user: { fullName: string } } | null;
  trackingEvents: Array<
    Pick<TrackingEvent, 'id' | 'fromStatus' | 'toStatus' | 'title' | 'notes' | 'actorRole' | 'createdAt'>
  >;
  progress: {
    current: OrderStatus;
    meta: StatusMeta;
    step: number;
    totalSteps: number;
    isTerminal: boolean;
    needsReschedule: boolean;
  };
}

export interface StatusMeta {
  label: string;
  description: string;
  tone: string;
  icon: string;
  step: number;
}

export interface Meta {
  roles: Role[];
  orderTypes: OrderType[];
  paymentTypes: PaymentType[];
  orderStatuses: OrderStatus[];
  statusMeta: Record<OrderStatus, StatusMeta>;
  happyPath: OrderStatus[];
  transitions: Record<OrderStatus, OrderStatus[]>;
  rolePermittedTargets: Record<Role, OrderStatus[]>;
  agentAvailability: AgentAvailability[];
  vehicleTypes: VehicleType[];
  vehicleCapacityKg: Record<VehicleType, number>;
  rateScopes: RateScope[];
  failureReasons: string[];
}

export interface Dashboard {
  role: Role;
  totals: {
    orders: number;
    delivered: number;
    failed: number;
    active: number;
    revenue: number;
    averageOrderValue: number;
    successRate: number | null;
  };
  statusCounts: Record<OrderStatus, number>;
  series: Array<{ date: string; orders: number; delivered: number; revenue: number }>;
  mix: {
    byOrderType: Array<{ name: string; value: number }>;
    byPaymentType: Array<{ name: string; value: number }>;
    byZone: Array<{ code: string; name: string; orders: number; revenue: number }>;
  };
  recentActivity: Array<{
    id: string;
    toStatus: OrderStatus;
    title: string;
    actorName: string;
    createdAt: string;
    order: { id: string; code: string; status: OrderStatus; customer: { fullName: string } };
  }>;
  network?: {
    zones: number;
    areas: number;
    customers: number;
    awaitingAssignment: number;
    agents: {
      total: number;
      available: number;
      leaderboard: Array<{
        id: string;
        name: string;
        zone: string | null;
        availability: AgentAvailability;
        activeOrders: number;
        capacity: number;
        delivered: number;
        failed: number;
        successRate: number | null;
      }>;
    };
  };
}
