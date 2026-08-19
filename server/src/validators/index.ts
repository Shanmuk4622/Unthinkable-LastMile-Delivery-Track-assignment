/**
 * Zod schemas — the API's contract with the outside world.
 *
 * Every enumerated value is derived from `domain/constants`, so a new order
 * status is accepted by the API the moment it is added to the domain, and never
 * before.
 */
import { z } from 'zod';
import {
  AGENT_AVAILABILITY,
  ORDER_STATUSES,
  ORDER_TYPES,
  PAYMENT_TYPES,
  RATE_SCOPES,
  ROLES,
  VEHICLE_TYPES,
} from '../domain/constants';

// ---------------------------------------------------------------------------
//  Primitives
// ---------------------------------------------------------------------------

export const idParam = z.object({ id: z.string().min(1, 'Missing id') });

export const codeParam = z.object({
  code: z.string().min(3, 'Tracking code looks too short').max(40),
});

const pincode = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .pipe(z.string().length(6, 'A pincode must be exactly 6 digits'));

const phone = z
  .string()
  .trim()
  .min(7, 'That phone number looks too short')
  .max(20, 'That phone number looks too long');

const password = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(72, 'Passwords are limited to 72 characters')
  .refine((v) => /[a-zA-Z]/.test(v) && /\d/.test(v), {
    message: 'Include at least one letter and one number',
  });

/** Query params arrive as strings; coerce and bound them. */
const positiveInt = (fallback: number, max: number) =>
  z.coerce.number().int().min(1).max(max).default(fallback);

// ---------------------------------------------------------------------------
//  Auth
// ---------------------------------------------------------------------------

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid e-mail address'),
  password,
  fullName: z.string().trim().min(2, 'Enter your full name').max(120),
  phone: phone.optional().nullable(),
  companyName: z.string().trim().max(160).optional().nullable(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid e-mail address'),
  password: z.string().min(1, 'Enter your password'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: password,
});

// ---------------------------------------------------------------------------
//  Addresses & quotes
// ---------------------------------------------------------------------------

export const addressSchema = z.object({
  label: z.string().trim().max(60).optional().nullable(),
  contactName: z.string().trim().min(2, 'Contact name is required').max(120),
  contactPhone: phone,
  line1: z.string().trim().min(3, 'Address line 1 is required').max(200),
  line2: z.string().trim().max(200).optional().nullable(),
  landmark: z.string().trim().max(160).optional().nullable(),
  city: z.string().trim().min(2, 'City is required').max(80),
  state: z.string().trim().max(80).optional().nullable(),
  pincode,
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
});

export const packageSchema = z.object({
  lengthCm: z.number().positive('Length must be greater than 0').max(500),
  breadthCm: z.number().positive('Breadth must be greater than 0').max(500),
  heightCm: z.number().positive('Height must be greater than 0').max(500),
  actualWeightKg: z.number().positive('Weight must be greater than 0').max(5000),
});

export const quoteSchema = packageSchema.extend({
  pickupPincode: pincode,
  dropPincode: pincode,
  orderType: z.enum(ORDER_TYPES),
  paymentType: z.enum(PAYMENT_TYPES),
  declaredValue: z.number().min(0).max(10_000_000).optional().default(0),
});

// ---------------------------------------------------------------------------
//  Orders
// ---------------------------------------------------------------------------

export const createOrderSchema = packageSchema.extend({
  /** Admin-only: place the order on behalf of an existing customer. */
  customerId: z.string().min(1).optional(),
  orderType: z.enum(ORDER_TYPES),
  paymentType: z.enum(PAYMENT_TYPES),
  declaredValue: z.number().min(0).max(10_000_000).optional().default(0),
  pickup: addressSchema,
  drop: addressSchema,
  scheduledDate: z.string().datetime().or(z.string().date()).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  confirmImmediately: z.boolean().optional().default(true),
  autoAssign: z.boolean().optional().default(false),
});

export const listOrdersSchema = z.object({
  status: z
    .union([z.enum(ORDER_STATUSES), z.array(z.enum(ORDER_STATUSES))])
    .optional()
    .transform((v) => (typeof v === 'string' ? v : v)),
  zoneId: z.string().optional(),
  agentId: z.string().optional(),
  customerId: z.string().optional(),
  orderType: z.enum(ORDER_TYPES).optional(),
  paymentType: z.enum(PAYMENT_TYPES).optional(),
  search: z.string().trim().max(120).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  sort: z.enum(['newest', 'oldest', 'value']).optional().default('newest'),
  page: positiveInt(1, 10_000),
  pageSize: positiveInt(20, 100),
});

export const changeStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  notes: z.string().trim().max(1000).optional().nullable(),
  failureReason: z.string().trim().max(300).optional().nullable(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  /** Admin-only escape hatch; ignored for other roles. */
  override: z.boolean().optional().default(false),
});

export const assignSchema = z.object({
  agentId: z.string().min(1, 'Choose a delivery agent'),
  reason: z.string().trim().max(300).optional(),
});

export const rescheduleSchema = z.object({
  newDate: z.string().datetime().or(z.string().date()),
  reason: z.string().trim().max(300).optional().nullable(),
});

export const cancelSchema = z.object({
  reason: z.string().trim().max(300).optional().nullable(),
});

// ---------------------------------------------------------------------------
//  Zones & areas
// ---------------------------------------------------------------------------

export const zoneSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, 'Zone code is required')
    .max(16)
    .regex(/^[A-Z0-9-]+$/, 'Use letters, numbers and hyphens only'),
  name: z.string().trim().min(2, 'Zone name is required').max(80),
  city: z.string().trim().min(2, 'City is required').max(80),
  state: z.string().trim().max(80).optional().nullable(),
  description: z.string().trim().max(300).optional().nullable(),
  centerLat: z.number().min(-90).max(90).optional().nullable(),
  centerLng: z.number().min(-180).max(180).optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

export const zoneUpdateSchema = zoneSchema.partial();

export const areaSchema = z.object({
  pincode,
  name: z.string().trim().min(2, 'Area name is required').max(80),
  city: z.string().trim().min(2, 'City is required').max(80),
  state: z.string().trim().max(80).optional().nullable(),
  zoneId: z.string().min(1, 'Pick the zone this area belongs to'),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

export const areaUpdateSchema = areaSchema.partial();

// ---------------------------------------------------------------------------
//  Pricing
// ---------------------------------------------------------------------------

export const pricingSettingsSchema = z.object({
  volumetricDivisor: z.number().positive('Divisor must be greater than 0').max(100_000),
  weightRoundingKg: z.number().positive().max(100),
  minChargeableWeightKg: z.number().min(0).max(100),
  currency: z.string().trim().length(3).toUpperCase().optional(),
});

export const rateCardSchema = z
  .object({
    name: z.string().trim().min(2, 'Give this rate card a name').max(120),
    orderType: z.enum(ORDER_TYPES),
    scope: z.enum(RATE_SCOPES),
    fromZoneId: z.string().optional().nullable(),
    toZoneId: z.string().optional().nullable(),
    baseWeightKg: z.number().positive('Base weight must be greater than 0').max(1000),
    basePrice: z.number().min(0).max(1_000_000),
    incrementalWeightKg: z.number().positive('Increment must be greater than 0').max(1000),
    incrementalPrice: z.number().min(0).max(1_000_000),
    fuelSurchargePct: z.number().min(0).max(100).optional().default(0),
    gstPct: z.number().min(0).max(100).optional().default(0),
    handlingFee: z.number().min(0).max(100_000).optional().default(0),
    priority: z.number().int().min(0).max(1000).optional().default(50),
    effectiveFrom: z.string().datetime().or(z.string().date()).optional(),
    effectiveTo: z.string().datetime().or(z.string().date()).optional().nullable(),
    isActive: z.boolean().optional().default(true),
  })
  .refine((v) => (v.fromZoneId ? Boolean(v.toZoneId) : !v.toZoneId), {
    message: 'A lane-specific card needs both a from-zone and a to-zone',
    path: ['toZoneId'],
  })
  .refine((v) => v.scope !== 'INTRA_ZONE' || !v.fromZoneId || v.fromZoneId === v.toZoneId, {
    message: 'An intra-zone lane card must use the same zone on both sides',
    path: ['toZoneId'],
  });

export const rateCardUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  orderType: z.enum(ORDER_TYPES).optional(),
  scope: z.enum(RATE_SCOPES).optional(),
  fromZoneId: z.string().optional().nullable(),
  toZoneId: z.string().optional().nullable(),
  baseWeightKg: z.number().positive().max(1000).optional(),
  basePrice: z.number().min(0).max(1_000_000).optional(),
  incrementalWeightKg: z.number().positive().max(1000).optional(),
  incrementalPrice: z.number().min(0).max(1_000_000).optional(),
  fuelSurchargePct: z.number().min(0).max(100).optional(),
  gstPct: z.number().min(0).max(100).optional(),
  handlingFee: z.number().min(0).max(100_000).optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  effectiveFrom: z.string().datetime().or(z.string().date()).optional(),
  effectiveTo: z.string().datetime().or(z.string().date()).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const codRuleSchema = z
  .object({
    orderType: z.enum(ORDER_TYPES),
    flatFee: z.number().min(0).max(100_000).optional().default(0),
    percentOfValue: z.number().min(0).max(100).optional().default(0),
    minFee: z.number().min(0).max(100_000).optional().default(0),
    maxFee: z.number().min(0).max(1_000_000).optional().nullable(),
    effectiveFrom: z.string().datetime().or(z.string().date()).optional(),
    effectiveTo: z.string().datetime().or(z.string().date()).optional().nullable(),
    isActive: z.boolean().optional().default(true),
  })
  .refine((v) => v.maxFee === null || v.maxFee === undefined || v.maxFee >= v.minFee, {
    message: 'The maximum fee cannot be lower than the minimum fee',
    path: ['maxFee'],
  });

export const codRuleUpdateSchema = codRuleSchema.innerType().partial();

// ---------------------------------------------------------------------------
//  Users & agents
// ---------------------------------------------------------------------------

export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid e-mail address'),
  password,
  fullName: z.string().trim().min(2).max(120),
  phone: phone.optional().nullable(),
  companyName: z.string().trim().max(160).optional().nullable(),
  role: z.enum(ROLES),
  agent: z
    .object({
      vehicleType: z.enum(VEHICLE_TYPES).optional().default('BIKE'),
      vehicleNumber: z.string().trim().max(24).optional().nullable(),
      zoneId: z.string().optional().nullable(),
      maxConcurrentOrders: z.number().int().min(1).max(50).optional().default(5),
      availability: z.enum(AGENT_AVAILABILITY).optional().default('OFFLINE'),
      currentLat: z.number().min(-90).max(90).optional().nullable(),
      currentLng: z.number().min(-180).max(180).optional().nullable(),
    })
    .optional(),
});

export const updateUserSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: phone.optional().nullable(),
  companyName: z.string().trim().max(160).optional().nullable(),
  isActive: z.boolean().optional(),
  role: z.enum(ROLES).optional(),
});

export const updateAgentSchema = z.object({
  vehicleType: z.enum(VEHICLE_TYPES).optional(),
  vehicleNumber: z.string().trim().max(24).optional().nullable(),
  zoneId: z.string().optional().nullable(),
  availability: z.enum(AGENT_AVAILABILITY).optional(),
  maxConcurrentOrders: z.number().int().min(1).max(50).optional(),
  currentLat: z.number().min(-90).max(90).optional().nullable(),
  currentLng: z.number().min(-180).max(180).optional().nullable(),
});

export const agentLocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const agentAvailabilitySchema = z.object({
  availability: z.enum(AGENT_AVAILABILITY),
});

export const listUsersSchema = z.object({
  role: z.enum(ROLES).optional(),
  search: z.string().trim().max(120).optional(),
  isActive: z.enum(['true', 'false']).optional(),
  page: positiveInt(1, 10_000),
  pageSize: positiveInt(20, 100),
});

export const listNotificationsSchema = z.object({
  orderId: z.string().optional(),
  channel: z.enum(['EMAIL', 'SMS']).optional(),
  status: z.enum(['QUEUED', 'SENT', 'FAILED', 'SKIPPED']).optional(),
  page: positiveInt(1, 10_000),
  pageSize: positiveInt(25, 100),
});

export const serviceabilitySchema = z.object({
  pincode,
});
