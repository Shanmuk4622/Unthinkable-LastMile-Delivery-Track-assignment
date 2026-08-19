/**
 * ════════════════════════════════════════════════════════════════════════════
 *  RATE CALCULATION ENGINE
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  The engine is a pure function of (shipment input) x (admin configuration).
 *  There is not a single magic number in this file: divisors, slab sizes,
 *  prices, surcharge percentages and COD rules all come from the database
 *  tables an administrator edits in the UI.
 *
 *  ┌──────────────────────────────────────────────────────────────────────┐
 *  │ STEP 1  Zone detection      pickup pincode  -> Area -> Zone A        │
 *  │                             drop   pincode  -> Area -> Zone B        │
 *  │                             scope = A === B ? INTRA_ZONE : INTER_ZONE│
 *  ├──────────────────────────────────────────────────────────────────────┤
 *  │ STEP 2  Volumetric weight   (L x B x H) / divisor      [divisor=5000]│
 *  ├──────────────────────────────────────────────────────────────────────┤
 *  │ STEP 3  Chargeable weight   max(actual, volumetric)                  │
 *  │                             then floored at minChargeableWeightKg    │
 *  │                             then rounded UP to the next slab         │
 *  ├──────────────────────────────────────────────────────────────────────┤
 *  │ STEP 4  Rate card lookup    (orderType, scope) + optional zone pair  │
 *  │                             highest priority wins                    │
 *  ├──────────────────────────────────────────────────────────────────────┤
 *  │ STEP 5  Freight             basePrice covers baseWeightKg;           │
 *  │                             extra slabs x incrementalPrice           │
 *  ├──────────────────────────────────────────────────────────────────────┤
 *  │ STEP 6  Handling + fuel     flat fee + fuelSurchargePct of freight   │
 *  ├──────────────────────────────────────────────────────────────────────┤
 *  │ STEP 7  COD surcharge       max(flatFee, pct x declaredValue)        │
 *  │                             clamped into [minFee, maxFee]            │
 *  ├──────────────────────────────────────────────────────────────────────┤
 *  │ STEP 8  Tax                 gstPct applied to everything above       │
 *  ├──────────────────────────────────────────────────────────────────────┤
 *  │ TOTAL   freight + handling + fuel + cod + tax                        │
 *  └──────────────────────────────────────────────────────────────────────┘
 *
 *  Every step emits a `RateLine` so the quote returned to the customer, the
 *  invoice stored on the order and the explanation shown to an admin are all
 *  the same object. Worked examples live in docs/RATE_ENGINE.md.
 */
import type { CodRule, PricingSetting, RateCard, Zone } from '@prisma/client';
import { prisma } from '../config/prisma';
import { rateNotConfigured } from '../utils/errors';
import { clampMoney, percentOf, round2, sumMoney, toMinor } from '../utils/money';
import type { OrderType, PaymentType, RateScope } from '../domain/constants';
import { detectZoneByPincode, scopeFor } from './zoneService';

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

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

/** One human-readable line of the price breakdown. */
export interface RateLine {
  key: string;
  label: string;
  /** How this number was arrived at, in plain English. */
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
    /** Which of the two won. */
    billedOn: 'ACTUAL' | 'VOLUMETRIC';
    /** After the minimum floor and slab rounding. */
    chargeableKg: number;
    volumetricDivisor: number;
    slabKg: number;
    /** Slabs charged beyond the base allowance. */
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
    /** True when a lane-specific override was used instead of the generic card. */
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

  /** Ordered, presentation-ready breakdown. */
  lines: RateLine[];

  meta: {
    calculatedAt: string;
    engineVersion: string;
    codRuleId: string | null;
  };
}

export const ENGINE_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
//  Configuration loaders
// ---------------------------------------------------------------------------

/**
 * The pricing settings row is a singleton. If an operator has never touched it
 * we materialise it with the documented industry defaults rather than
 * scattering fallbacks through the maths.
 */
export async function getPricingSettings(): Promise<PricingSetting> {
  const existing = await prisma.pricingSetting.findUnique({ where: { id: 'default' } });
  if (existing) return existing;
  return prisma.pricingSetting.create({ data: { id: 'default' } });
}

/**
 * Rate card resolution.
 *
 * Precedence, highest first:
 *   1. a card naming this exact lane   (fromZoneId = A, toZoneId = B)
 *   2. a card for the scope            (fromZoneId = null, toZoneId = null)
 * Ties are broken by `priority`, then by the most recently effective card, so
 * an admin can publish a promotional card without deleting the standing one.
 */
export async function resolveRateCard(params: {
  orderType: OrderType;
  scope: RateScope;
  pickupZoneId: string;
  dropZoneId: string;
  at?: Date;
}): Promise<{ card: RateCard; laneSpecific: boolean }> {
  const at = params.at ?? new Date();

  const effective = {
    isActive: true,
    effectiveFrom: { lte: at },
    OR: [{ effectiveTo: null }, { effectiveTo: { gte: at } }],
  };

  const candidates = await prisma.rateCard.findMany({
    where: {
      orderType: params.orderType,
      scope: params.scope,
      ...effective,
      AND: [
        {
          OR: [
            // lane-specific override
            { fromZoneId: params.pickupZoneId, toZoneId: params.dropZoneId },
            // generic card for the whole scope
            { fromZoneId: null, toZoneId: null },
          ],
        },
      ],
    },
    orderBy: [{ priority: 'desc' }, { effectiveFrom: 'desc' }],
  });

  const lane = candidates.find(
    (c) => c.fromZoneId === params.pickupZoneId && c.toZoneId === params.dropZoneId,
  );
  const generic = candidates.find((c) => c.fromZoneId === null && c.toZoneId === null);

  const chosen = lane ?? generic;

  if (!chosen) {
    throw rateNotConfigured(
      `No active ${params.orderType} rate card covers a ${params.scope.replace('_', ' ').toLowerCase()} shipment on this lane. ` +
        'An admin can create one under Pricing -> Rate cards.',
      { orderType: params.orderType, scope: params.scope },
    );
  }

  return { card: chosen, laneSpecific: Boolean(lane) };
}

/** The COD rule in force for an order type, or null if COD is not surcharged. */
export async function resolveCodRule(
  orderType: OrderType,
  at: Date = new Date(),
): Promise<CodRule | null> {
  const rules = await prisma.codRule.findMany({
    where: {
      orderType,
      isActive: true,
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: at } }],
    },
    orderBy: { effectiveFrom: 'desc' },
  });
  return rules[0] ?? null;
}

// ---------------------------------------------------------------------------
//  Pure maths — exported so the unit tests can hit them without a database
// ---------------------------------------------------------------------------

/**
 * STEP 2 — Volumetric (dimensional) weight.
 *
 *   volumetric kg = (L cm x B cm x H cm) / divisor
 *
 * The divisor encodes how much space a kilogram of "average" cargo occupies.
 * 5000 is the IATA/courier standard for road and air express; the admin can
 * lower it to 4000 to bill bulky freight harder.
 */
export function volumetricWeight(
  lengthCm: number,
  breadthCm: number,
  heightCm: number,
  divisor: number,
): number {
  if (divisor <= 0) throw rateNotConfigured('Volumetric divisor must be greater than zero.');
  return round3((lengthCm * breadthCm * heightCm) / divisor);
}

/**
 * STEP 3 — Chargeable weight.
 *
 * Bill on whichever is greater — dense parcels bill on the scale, bulky ones on
 * the space they steal from the van — then apply the minimum, then round *up*
 * to the next slab (a 0.6 kg parcel on 0.5 kg slabs bills as 1.0 kg).
 */
export function chargeableWeight(params: {
  actualKg: number;
  volumetricKg: number;
  minKg: number;
  slabKg: number;
}): { chargeableKg: number; billedOn: 'ACTUAL' | 'VOLUMETRIC' } {
  const billedOn = params.volumetricKg > params.actualKg ? 'VOLUMETRIC' : 'ACTUAL';
  const higher = Math.max(params.actualKg, params.volumetricKg);
  const floored = Math.max(higher, params.minKg);

  const slab = params.slabKg > 0 ? params.slabKg : 0.5;
  // Work in integer grams to keep the ceiling honest: 1.5 / 0.5 can evaluate to
  // 2.9999999999999996 in IEEE-754, which would silently add a slab.
  const grams = Math.round(floored * 1000);
  const slabGrams = Math.round(slab * 1000);
  const slabs = Math.ceil(grams / slabGrams);

  return { chargeableKg: round3((slabs * slabGrams) / 1000), billedOn };
}

/**
 * STEP 5 — Slab freight.
 *
 *   basePrice                                  covers 0 .. baseWeightKg
 *   + ceil((chargeable - base) / incKg) x incPrice   for everything above
 */
export function freightFor(
  chargeableKg: number,
  card: Pick<RateCard, 'baseWeightKg' | 'basePrice' | 'incrementalWeightKg' | 'incrementalPrice'>,
): { baseCharge: number; weightCharge: number; extraSlabs: number } {
  const baseCharge = round2(card.basePrice);

  const overGrams = Math.round((chargeableKg - card.baseWeightKg) * 1000);
  if (overGrams <= 0) {
    return { baseCharge, weightCharge: 0, extraSlabs: 0 };
  }

  const incGrams = Math.round((card.incrementalWeightKg > 0 ? card.incrementalWeightKg : 0.5) * 1000);
  const extraSlabs = Math.ceil(overGrams / incGrams);

  return {
    baseCharge,
    weightCharge: round2((extraSlabs * toMinor(card.incrementalPrice)) / 100),
    extraSlabs,
  };
}

/**
 * STEP 7 — COD surcharge.
 *
 *   fee = max(flatFee, declaredValue x percentOfValue%)
 *   fee = clamp(fee, minFee, maxFee)
 *
 * Taking the *maximum* of the flat and percentage components (rather than the
 * sum) is what carriers actually do: the flat fee is a floor that makes small
 * cash collections worth handling, the percentage takes over once the cash
 * being carried becomes a real risk.
 */
export function codSurchargeFor(
  declaredValue: number,
  rule: Pick<CodRule, 'flatFee' | 'percentOfValue' | 'minFee' | 'maxFee'> | null,
): number {
  if (!rule) return 0;
  const percentComponent = percentOf(Math.max(0, declaredValue), rule.percentOfValue);
  const raw = Math.max(rule.flatFee, percentComponent);
  return clampMoney(raw, rule.minFee, rule.maxFee);
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

// ---------------------------------------------------------------------------
//  The orchestrator
// ---------------------------------------------------------------------------

/**
 * Produce a complete, explainable quote. This is called twice in an order's
 * life: once for the pre-confirmation estimate the customer sees, and once
 * again when the order is actually created — the second result is frozen onto
 * the order row so a later rate-card edit can never rewrite history.
 */
export async function calculateQuote(input: QuoteInput): Promise<Quote> {
  const at = new Date();

  // ---- STEP 1: zone detection ------------------------------------------
  const [pickup, drop] = await Promise.all([
    detectZoneByPincode(input.pickupPincode),
    detectZoneByPincode(input.dropPincode),
  ]);

  const scope = scopeFor(pickup.zone.id, drop.zone.id);

  // ---- configuration ----------------------------------------------------
  const settings = await getPricingSettings();
  const { card, laneSpecific } = await resolveRateCard({
    orderType: input.orderType,
    scope,
    pickupZoneId: pickup.zone.id,
    dropZoneId: drop.zone.id,
    at,
  });

  // ---- STEP 2 + 3: weights ---------------------------------------------
  const volumetricKg = volumetricWeight(
    input.lengthCm,
    input.breadthCm,
    input.heightCm,
    settings.volumetricDivisor,
  );

  const { chargeableKg, billedOn } = chargeableWeight({
    actualKg: input.actualWeightKg,
    volumetricKg,
    minKg: settings.minChargeableWeightKg,
    slabKg: settings.weightRoundingKg,
  });

  // ---- STEP 5: freight --------------------------------------------------
  const { baseCharge, weightCharge, extraSlabs } = freightFor(chargeableKg, card);
  const freight = sumMoney(baseCharge, weightCharge);

  // ---- STEP 6: handling + fuel -----------------------------------------
  const handlingFee = round2(card.handlingFee);
  const fuelSurcharge = percentOf(freight, card.fuelSurchargePct);

  // ---- STEP 7: COD ------------------------------------------------------
  const codRule = input.paymentType === 'COD' ? await resolveCodRule(input.orderType, at) : null;
  const codSurcharge =
    input.paymentType === 'COD' ? codSurchargeFor(input.declaredValue ?? 0, codRule) : 0;

  // ---- STEP 8: tax ------------------------------------------------------
  const taxableAmount = sumMoney(freight, handlingFee, fuelSurcharge, codSurcharge);
  const taxAmount = percentOf(taxableAmount, card.gstPct);

  const total = sumMoney(taxableAmount, taxAmount);

  // ---- presentation -----------------------------------------------------
  const lines: RateLine[] = [
    {
      key: 'base',
      label: `Base freight (up to ${card.baseWeightKg} kg)`,
      formula: `${card.name} — ${input.orderType} ${scope === 'INTRA_ZONE' ? 'intra-zone' : 'inter-zone'}`,
      amount: baseCharge,
      kind: 'charge',
    },
  ];

  if (extraSlabs > 0) {
    lines.push({
      key: 'weight',
      label: `Additional weight (${extraSlabs} x ${card.incrementalWeightKg} kg slab)`,
      formula: `ceil((${chargeableKg} kg − ${card.baseWeightKg} kg) ÷ ${card.incrementalWeightKg} kg) × ₹${card.incrementalPrice}`,
      amount: weightCharge,
      kind: 'charge',
    });
  }

  if (handlingFee > 0) {
    lines.push({
      key: 'handling',
      label: 'Handling fee',
      formula: 'Flat per-shipment fee from the rate card',
      amount: handlingFee,
      kind: 'charge',
    });
  }

  if (fuelSurcharge > 0) {
    lines.push({
      key: 'fuel',
      label: `Fuel surcharge (${card.fuelSurchargePct}%)`,
      formula: `${card.fuelSurchargePct}% × ₹${freight} freight`,
      amount: fuelSurcharge,
      kind: 'charge',
    });
  }

  if (input.paymentType === 'COD') {
    lines.push({
      key: 'cod',
      label: 'COD surcharge',
      formula: codRule
        ? `max(₹${codRule.flatFee} flat, ${codRule.percentOfValue}% × ₹${input.declaredValue ?? 0} declared)` +
          `, clamped to ₹${codRule.minFee}–${codRule.maxFee ?? '∞'}`
        : `No COD rule configured for ${input.orderType} — surcharge waived`,
      amount: codSurcharge,
      kind: 'charge',
    });
  }

  if (taxAmount > 0) {
    lines.push({
      key: 'gst',
      label: `GST (${card.gstPct}%)`,
      formula: `${card.gstPct}% × ₹${taxableAmount} taxable value`,
      amount: taxAmount,
      kind: 'tax',
    });
  }

  return {
    currency: settings.currency,
    zones: {
      pickup: {
        id: pickup.zone.id,
        code: pickup.zone.code,
        name: pickup.zone.name,
        city: pickup.zone.city,
      },
      drop: {
        id: drop.zone.id,
        code: drop.zone.code,
        name: drop.zone.name,
        city: drop.zone.city,
      },
      scope,
      sameZone: scope === 'INTRA_ZONE',
    },
    weights: {
      actualKg: round3(input.actualWeightKg),
      volumetricKg,
      billedOn,
      chargeableKg,
      volumetricDivisor: settings.volumetricDivisor,
      slabKg: settings.weightRoundingKg,
      extraSlabs,
    },
    rateCard: {
      id: card.id,
      name: card.name,
      orderType: card.orderType as OrderType,
      scope: card.scope as RateScope,
      baseWeightKg: card.baseWeightKg,
      basePrice: card.basePrice,
      incrementalWeightKg: card.incrementalWeightKg,
      incrementalPrice: card.incrementalPrice,
      laneSpecific,
    },
    charges: {
      baseCharge,
      weightCharge,
      handlingFee,
      fuelSurcharge,
      codSurcharge,
      taxableAmount,
      taxAmount,
      gstPct: card.gstPct,
      total,
    },
    lines,
    meta: {
      calculatedAt: at.toISOString(),
      engineVersion: ENGINE_VERSION,
      codRuleId: codRule?.id ?? null,
    },
  };
}
