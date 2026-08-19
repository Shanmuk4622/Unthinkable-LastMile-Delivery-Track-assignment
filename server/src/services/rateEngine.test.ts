/**
 * Rate engine unit tests.
 *
 * These exercise the pure maths without touching the database, which is why
 * volumetricWeight / chargeableWeight / freightFor / codSurchargeFor are
 * exported separately from the orchestrator. Correctness of the pricing engine
 * is the single most important thing in this codebase, so the edge cases that
 * actually bite in production get named tests: float drift on slab boundaries,
 * the flat-vs-percentage COD choice, and the clamp order.
 */
import { describe, expect, it } from 'vitest';
import {
  chargeableWeight,
  codSurchargeFor,
  freightFor,
  volumetricWeight,
} from './rateEngine';
import { clampMoney, percentOf, round2, sumMoney } from '../utils/money';

describe('volumetricWeight', () => {
  it('divides the cubic volume by the configured divisor', () => {
    // 30 x 20 x 15 = 9000 cm³ -> 1.8 kg at the industry-standard 5000 divisor
    expect(volumetricWeight(30, 20, 15, 5000)).toBe(1.8);
  });

  it('bills bulky freight harder when the divisor is lowered', () => {
    expect(volumetricWeight(30, 20, 15, 4000)).toBe(2.25);
  });

  it('is admin-configurable rather than hardcoded', () => {
    expect(volumetricWeight(10, 10, 10, 1000)).toBe(1);
    expect(volumetricWeight(10, 10, 10, 500)).toBe(2);
  });

  it('refuses a zero or negative divisor instead of returning Infinity', () => {
    expect(() => volumetricWeight(30, 20, 15, 0)).toThrow();
    expect(() => volumetricWeight(30, 20, 15, -5000)).toThrow();
  });
});

describe('chargeableWeight', () => {
  const slabs = { minKg: 0.5, slabKg: 0.5 };

  it('bills on the volumetric weight when the parcel is bulky', () => {
    const result = chargeableWeight({ actualKg: 1.2, volumetricKg: 1.8, ...slabs });
    expect(result.billedOn).toBe('VOLUMETRIC');
    expect(result.chargeableKg).toBe(2);
  });

  it('bills on the actual weight when the parcel is dense', () => {
    const result = chargeableWeight({ actualKg: 8, volumetricKg: 1.8, ...slabs });
    expect(result.billedOn).toBe('ACTUAL');
    expect(result.chargeableKg).toBe(8);
  });

  it('applies the minimum chargeable weight to tiny parcels', () => {
    const result = chargeableWeight({ actualKg: 0.05, volumetricKg: 0.02, ...slabs });
    expect(result.chargeableKg).toBe(0.5);
  });

  it('rounds up to the next slab, never down', () => {
    expect(chargeableWeight({ actualKg: 0.6, volumetricKg: 0, ...slabs }).chargeableKg).toBe(1);
    expect(chargeableWeight({ actualKg: 1.01, volumetricKg: 0, ...slabs }).chargeableKg).toBe(1.5);
  });

  it('leaves an exact slab boundary alone', () => {
    // The float trap: 1.5 / 0.5 evaluates to 2.9999999999999996 in IEEE-754,
    // so a naive Math.ceil would silently add a whole extra slab here.
    expect(chargeableWeight({ actualKg: 1.5, volumetricKg: 0, ...slabs }).chargeableKg).toBe(1.5);
    expect(chargeableWeight({ actualKg: 2.9, volumetricKg: 0, ...slabs }).chargeableKg).toBe(3);
    expect(chargeableWeight({ actualKg: 3.0, volumetricKg: 0, ...slabs }).chargeableKg).toBe(3);
  });

  it('honours a non-default slab size', () => {
    const result = chargeableWeight({
      actualKg: 5.2,
      volumetricKg: 0,
      minKg: 1,
      slabKg: 1,
    });
    expect(result.chargeableKg).toBe(6);
  });

  it('prefers ACTUAL when the two weights tie', () => {
    const result = chargeableWeight({ actualKg: 2, volumetricKg: 2, ...slabs });
    expect(result.billedOn).toBe('ACTUAL');
  });
});

describe('freightFor', () => {
  const card = {
    baseWeightKg: 0.5,
    basePrice: 49,
    incrementalWeightKg: 0.5,
    incrementalPrice: 22,
  };

  it('charges only the base price inside the base allowance', () => {
    expect(freightFor(0.5, card)).toEqual({ baseCharge: 49, weightCharge: 0, extraSlabs: 0 });
  });

  it('charges one slab for the first gram over the allowance', () => {
    const result = freightFor(1, card);
    expect(result.extraSlabs).toBe(1);
    expect(result.weightCharge).toBe(22);
  });

  it('matches the worked example in the docs', () => {
    // 2 kg chargeable: base 0.5 kg + 3 slabs of 0.5 kg = 49 + 66
    const result = freightFor(2, card);
    expect(result.extraSlabs).toBe(3);
    expect(result.baseCharge).toBe(49);
    expect(result.weightCharge).toBe(66);
  });

  it('handles a B2B card with a high base allowance', () => {
    const b2b = {
      baseWeightKg: 5,
      basePrice: 180,
      incrementalWeightKg: 1,
      incrementalPrice: 18,
    };
    expect(freightFor(5, b2b).weightCharge).toBe(0);
    expect(freightFor(12, b2b)).toEqual({ baseCharge: 180, weightCharge: 126, extraSlabs: 7 });
  });

  it('never charges a negative amount for an underweight parcel', () => {
    const result = freightFor(0.2, card);
    expect(result.weightCharge).toBe(0);
    expect(result.extraSlabs).toBe(0);
  });
});

describe('codSurchargeFor', () => {
  const b2c = { flatFee: 40, percentOfValue: 1.5, minFee: 40, maxFee: 500 };

  it('is zero when no rule is configured', () => {
    expect(codSurchargeFor(5000, null)).toBe(0);
  });

  it('takes the flat fee when the percentage is smaller', () => {
    // 1.5% of 1000 = 15, below the 40 flat fee
    expect(codSurchargeFor(1000, b2c)).toBe(40);
  });

  it('takes the percentage when it overtakes the flat fee', () => {
    // 1.5% of 4500 = 67.50
    expect(codSurchargeFor(4500, b2c)).toBe(67.5);
  });

  it('clamps at the maximum fee for high-value shipments', () => {
    // 1.5% of 100000 = 1500, capped at 500
    expect(codSurchargeFor(100000, b2c)).toBe(500);
  });

  it('applies the floor even when both components are lower', () => {
    const rule = { flatFee: 0, percentOfValue: 0.1, minFee: 25, maxFee: 500 };
    expect(codSurchargeFor(100, rule)).toBe(25);
  });

  it('treats a null maximum as no ceiling', () => {
    const rule = { flatFee: 0, percentOfValue: 2, minFee: 0, maxFee: null };
    expect(codSurchargeFor(100000, rule)).toBe(2000);
  });

  it('does not go negative on a nonsensical declared value', () => {
    expect(codSurchargeFor(-5000, b2c)).toBe(40);
  });
});

describe('money arithmetic', () => {
  it('does not accumulate float error across a full invoice', () => {
    // The classic failure: 0.1 + 0.2 !== 0.3 in IEEE-754.
    expect(sumMoney(0.1, 0.2)).toBe(0.3);
    expect(sumMoney(49, 66, 6.9, 67.5)).toBe(189.4);
  });

  it('rounds GST to the paisa the same way an invoice does', () => {
    // 18% of 189.40 = 34.092 -> 34.09
    expect(percentOf(189.4, 18)).toBe(34.09);
  });

  it('reproduces the end-to-end worked example exactly', () => {
    const freight = sumMoney(49, 66);
    const fuel = percentOf(freight, 6);
    const cod = clampMoney(Math.max(40, percentOf(4500, 1.5)), 40, 500);
    const taxable = sumMoney(freight, fuel, cod);
    const gst = percentOf(taxable, 18);

    expect(freight).toBe(115);
    expect(fuel).toBe(6.9);
    expect(cod).toBe(67.5);
    expect(taxable).toBe(189.4);
    expect(gst).toBe(34.09);
    expect(sumMoney(taxable, gst)).toBe(223.49);
  });

  it('rounds half away from zero, as invoices expect', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
  });
});
