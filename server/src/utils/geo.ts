/**
 * Geospatial helpers used by the auto-assignment engine.
 *
 * We deliberately avoid a PostGIS dependency: the search space is "agents on
 * duty right now", which is tens of rows, not millions. A great-circle
 * calculation in JavaScript over that set is both exact enough for dispatch and
 * portable to SQLite. The trade-off (and when to graduate to a spatial index)
 * is written up in docs/AUTO_ASSIGNMENT.md.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371.0088;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Great-circle distance between two points, in kilometres (haversine formula).
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Road distance is always longer than the crow-flies distance. A 1.3 detour
 * factor is the usual planning heuristic for dense Indian metros and keeps ETA
 * estimates honest without needing a routing API.
 */
export const ROAD_DETOUR_FACTOR = 1.3;

export function estimatedRoadKm(a: LatLng, b: LatLng): number {
  return round(haversineKm(a, b) * ROAD_DETOUR_FACTOR, 2);
}

/**
 * Rough ETA in minutes, assuming an average urban speed plus a fixed handling
 * allowance for parking, lifts and paperwork.
 */
export function estimatedMinutes(distanceKm: number, avgSpeedKmh = 22, handlingMin = 8): number {
  if (distanceKm <= 0) return handlingMin;
  return Math.round((distanceKm / avgSpeedKmh) * 60 + handlingMin);
}

export function isValidLatLng(value: Partial<LatLng> | null | undefined): value is LatLng {
  return (
    !!value &&
    typeof value.lat === 'number' &&
    typeof value.lng === 'number' &&
    Number.isFinite(value.lat) &&
    Number.isFinite(value.lng) &&
    Math.abs(value.lat) <= 90 &&
    Math.abs(value.lng) <= 180
  );
}

/**
 * Pick the best available position for an entity, degrading gracefully:
 *   live GPS fix  ->  area centroid  ->  zone centroid  ->  null
 */
export function resolvePosition(
  ...candidates: Array<Partial<LatLng> | null | undefined>
): LatLng | null {
  for (const candidate of candidates) {
    if (isValidLatLng(candidate)) return { lat: candidate.lat, lng: candidate.lng };
  }
  return null;
}

function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
