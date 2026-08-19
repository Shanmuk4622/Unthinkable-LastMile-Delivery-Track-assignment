/**
 * Zone detection.
 * ---------------------------------------------------------------------------
 * "Detect the pickup and drop zone" is, at its core, a question about
 * *serviceability*: which operational region owns this address?
 *
 * SwiftRoute answers it with a **pincode -> area -> zone** lookup table that an
 * admin owns entirely:
 *
 *      560034 ─┐
 *      560095 ─┼─► Area rows ──► Zone "BLR-S" (South Bengaluru)
 *      560029 ─┘
 *
 * Why a lookup table rather than geometry?
 *   • It is exactly how real 3PL networks encode serviceability — couriers
 *     publish "serviceable pincode" lists, not polygons.
 *   • Detection becomes a single indexed equality lookup (`Area.pincode` is
 *     UNIQUE) instead of a point-in-polygon test, so it stays O(1) and works
 *     identically on SQLite and PostgreSQL.
 *   • Operations staff can onboard a new locality from the admin UI without a
 *     GIS tool.
 *
 * Coordinates are still carried on every Area and Zone (centroids). They are
 * not used for detection — they feed the distance maths in the assignment
 * engine when an address arrives without a precise GPS fix.
 *
 * See docs/RATE_ENGINE.md#zone-detection for the full write-up, including how
 * this would evolve into polygon lookup with PostGIS.
 */
import type { Area, Zone } from '@prisma/client';
import { prisma } from '../config/prisma';
import { zoneNotServiceable } from '../utils/errors';

export interface ZoneResolution {
  zone: Zone;
  area: Area;
  /** Best-effort coordinates for the address: its own fix, else the area centroid. */
  lat: number | null;
  lng: number | null;
}

/** Normalise user input: strip spaces/hyphens, keep digits. */
export function normalisePincode(pincode: string): string {
  return String(pincode ?? '').replace(/\D/g, '').trim();
}

/**
 * Resolve a pincode to its zone.
 * @throws AppError(422, ZONE_NOT_SERVICEABLE) when the pincode is unmapped or
 *         its area/zone has been deactivated.
 */
export async function detectZoneByPincode(rawPincode: string): Promise<ZoneResolution> {
  const pincode = normalisePincode(rawPincode);

  const area = await prisma.area.findUnique({
    where: { pincode },
    include: { zone: true },
  });

  if (!area || !area.isActive || !area.zone || !area.zone.isActive) {
    throw zoneNotServiceable(pincode);
  }

  return {
    zone: area.zone,
    area,
    lat: area.lat ?? area.zone.centerLat ?? null,
    lng: area.lng ?? area.zone.centerLng ?? null,
  };
}

/** Non-throwing variant used by the serviceability checker on the booking form. */
export async function tryDetectZoneByPincode(
  rawPincode: string,
): Promise<ZoneResolution | null> {
  try {
    return await detectZoneByPincode(rawPincode);
  } catch {
    return null;
  }
}

/**
 * INTRA_ZONE when both legs sit in the same zone, INTER_ZONE otherwise.
 * This single boolean is what selects between the two halves of every rate card
 * set the admin configures.
 */
export function scopeFor(pickupZoneId: string, dropZoneId: string): 'INTRA_ZONE' | 'INTER_ZONE' {
  return pickupZoneId === dropZoneId ? 'INTRA_ZONE' : 'INTER_ZONE';
}

/** All serviceable pincodes, grouped by zone — powers the admin coverage map. */
export async function listServiceableAreas() {
  return prisma.area.findMany({
    where: { isActive: true },
    include: { zone: { select: { id: true, code: true, name: true, city: true } } },
    orderBy: [{ city: 'asc' }, { pincode: 'asc' }],
  });
}
