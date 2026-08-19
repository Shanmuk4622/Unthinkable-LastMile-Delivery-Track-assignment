/**
 * ════════════════════════════════════════════════════════════════════════════
 *  AUTO-ASSIGNMENT ENGINE  —  "nearest available agent"
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Dispatch is a ranking problem, not a lookup. "Nearest" alone produces a
 *  dispatcher that hands six parcels to the one rider standing outside the
 *  warehouse while an idle rider two kilometres away does nothing. SwiftRoute
 *  therefore scores every eligible agent on four normalised signals and picks
 *  the maximum.
 *
 *  ── Pipeline ───────────────────────────────────────────────────────────────
 *
 *   ┌────────────────┐   ┌──────────────────┐   ┌───────────────┐   ┌────────┐
 *   │ 1. ELIGIBILITY │──►│ 2. LOCATE        │──►│ 3. SCORE      │──►│ 4. PICK│
 *   │ hard filters   │   │ gps → area →     │   │ weighted sum  │   │  max   │
 *   └────────────────┘   │ zone centroid    │   └───────────────┘   └────────┘
 *                        └──────────────────┘
 *
 *  1. ELIGIBILITY (hard, non-negotiable)
 *       • account active and availability = AVAILABLE
 *       • activeOrderCount < maxConcurrentOrders          (capacity)
 *       • vehicle can carry the chargeable weight          (physics)
 *       • not the agent who just failed this order         (fairness)
 *
 *  2. LOCATE — an agent's position degrades gracefully:
 *       live GPS fix  →  home-zone centroid  →  unlocatable (proximity = 0)
 *     The pickup point degrades the same way: address fix → area → zone.
 *
 *  3. SCORE — each signal is normalised to [0, 1] and multiplied by an
 *     operator-tunable weight from .env (defaults in brackets):
 *
 *       proximity   [0.50]  1 − distanceKm / ASSIGN_MAX_DISTANCE_KM
 *       zone match  [0.25]  1.0 same zone as pickup · 0.4 same as drop · 0 else
 *       workload    [0.15]  1 − activeOrders / maxConcurrent
 *       performance [0.10]  0.7 × deliverySuccessRate + 0.3 × (rating / 5)
 *
 *     score = Σ weightᵢ × signalᵢ        (weights are re-normalised to sum to 1)
 *
 *  4. PICK — highest score wins; ties break on shorter distance, then on the
 *     lighter workload. If the radius filter empties the shortlist the engine
 *     retries once without it and flags the result `widenedSearch`, so an
 *     order is never silently left unassigned in a thin-coverage zone.
 *
 *  The whole ranked shortlist is persisted on AssignmentHistory, which means
 *  every automatic decision can be explained after the fact — the admin UI
 *  renders exactly this table.
 *
 *  Full write-up, including complexity and the road to a real VRP solver:
 *  docs/AUTO_ASSIGNMENT.md
 */
import type { AgentProfile, User, Zone } from '@prisma/client';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { estimatedMinutes, estimatedRoadKm, resolvePosition, type LatLng } from '../utils/geo';
import { VEHICLE_CAPACITY_KG, type VehicleType } from '../domain/constants';

type AgentWithRelations = AgentProfile & {
  user: Pick<User, 'id' | 'fullName' | 'email' | 'phone' | 'isActive'>;
  zone: Zone | null;
};

export interface AssignmentContext {
  pickupZoneId: string | null;
  dropZoneId: string | null;
  /** Best-known coordinates of the pickup point. */
  pickupPosition: LatLng | null;
  /** Billable weight — used against vehicle capacity. */
  chargeableWeightKg: number;
  /** Agent to exclude, e.g. the one who just failed the delivery. */
  excludeAgentId?: string | null;
}

export interface ScoredCandidate {
  agentId: string;
  agentName: string;
  vehicleType: string;
  zoneCode: string | null;
  availability: string;
  activeOrders: number;
  maxConcurrentOrders: number;

  distanceKm: number | null;
  etaMinutes: number | null;

  signals: {
    proximity: number;
    zoneMatch: number;
    workload: number;
    performance: number;
  };
  score: number;

  /** Populated when the agent was filtered out; null when eligible. */
  rejectedBecause: string | null;
}

export interface AssignmentDecision {
  chosen: ScoredCandidate | null;
  ranked: ScoredCandidate[];
  rejected: ScoredCandidate[];
  widenedSearch: boolean;
  reason: string;
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));
const round = (n: number, d = 4): number => Math.round(n * 10 ** d) / 10 ** d;

// ---------------------------------------------------------------------------
//  Signals
// ---------------------------------------------------------------------------

/** 1 when the agent is standing on the pickup point, 0 at/beyond the radius. */
export function proximitySignal(distanceKm: number | null, maxKm: number): number {
  if (distanceKm === null) return 0;
  if (maxKm <= 0) return distanceKm === 0 ? 1 : 0;
  return clamp01(1 - distanceKm / maxKm);
}

/**
 * Agents know their own zone: its lifts, its one-ways, its security desks.
 * A same-zone agent is worth a meaningful head start over a marginally closer
 * outsider. Owning the *drop* zone is worth something too — the agent finishes
 * the trip on home turf.
 */
export function zoneSignal(
  agentZoneId: string | null,
  pickupZoneId: string | null,
  dropZoneId: string | null,
): number {
  if (!agentZoneId) return 0;
  if (pickupZoneId && agentZoneId === pickupZoneId) return 1;
  if (dropZoneId && agentZoneId === dropZoneId) return 0.4;
  return 0;
}

/** 1 when completely free, 0 when at capacity. */
export function workloadSignal(activeOrders: number, maxConcurrent: number): number {
  if (maxConcurrent <= 0) return 0;
  return clamp01(1 - activeOrders / maxConcurrent);
}

/**
 * Reward reliability. New agents with no history score a neutral 0.8 rather
 * than 0 — a cold-start penalty would starve them of the very orders they need
 * to build a record.
 */
export function performanceSignal(agent: {
  totalDelivered: number;
  totalFailed: number;
  ratingAvg: number;
}): number {
  const attempts = agent.totalDelivered + agent.totalFailed;
  const successRate = attempts === 0 ? 0.8 : agent.totalDelivered / attempts;
  const rating = clamp01((agent.ratingAvg || 5) / 5);
  return clamp01(0.7 * successRate + 0.3 * rating);
}

/** Does this vehicle class have any business carrying this shipment? */
export function canCarry(vehicleType: string, chargeableWeightKg: number): boolean {
  const capacity = VEHICLE_CAPACITY_KG[vehicleType as VehicleType];
  if (capacity === undefined) return true; // unknown class -> do not block dispatch
  return chargeableWeightKg <= capacity;
}

// ---------------------------------------------------------------------------
//  The engine
// ---------------------------------------------------------------------------

/**
 * Rank every agent for a shipment without mutating anything. The caller
 * (orderService) decides whether to act on the result, which keeps this
 * function trivially testable and lets the admin UI render a "who would get
 * this?" preview without side effects.
 */
export async function rankAgents(context: AssignmentContext): Promise<AssignmentDecision> {
  const weights = env.assignmentWeights;
  const maxKm = env.ASSIGN_MAX_DISTANCE_KM;

  const agents = (await prisma.agentProfile.findMany({
    include: {
      user: { select: { id: true, fullName: true, email: true, phone: true, isActive: true } },
      zone: true,
    },
  })) as AgentWithRelations[];

  const eligible: ScoredCandidate[] = [];
  const rejected: ScoredCandidate[] = [];

  for (const agent of agents) {
    const position = resolvePosition(
      agent.currentLat !== null && agent.currentLng !== null
        ? { lat: agent.currentLat, lng: agent.currentLng }
        : null,
      agent.zone && agent.zone.centerLat !== null && agent.zone.centerLng !== null
        ? { lat: agent.zone.centerLat, lng: agent.zone.centerLng }
        : null,
    );

    const distanceKm =
      position && context.pickupPosition
        ? estimatedRoadKm(position, context.pickupPosition)
        : null;

    const signals = {
      proximity: proximitySignal(distanceKm, maxKm),
      zoneMatch: zoneSignal(agent.zoneId, context.pickupZoneId, context.dropZoneId),
      workload: workloadSignal(agent.activeOrderCount, agent.maxConcurrentOrders),
      performance: performanceSignal(agent),
    };

    const score = round(
      weights.distance * signals.proximity +
        weights.zone * signals.zoneMatch +
        weights.workload * signals.workload +
        weights.performance * signals.performance,
    );

    const candidate: ScoredCandidate = {
      agentId: agent.id,
      agentName: agent.user.fullName,
      vehicleType: agent.vehicleType,
      zoneCode: agent.zone?.code ?? null,
      availability: agent.availability,
      activeOrders: agent.activeOrderCount,
      maxConcurrentOrders: agent.maxConcurrentOrders,
      distanceKm,
      etaMinutes: distanceKm === null ? null : estimatedMinutes(distanceKm),
      signals: {
        proximity: round(signals.proximity),
        zoneMatch: round(signals.zoneMatch),
        workload: round(signals.workload),
        performance: round(signals.performance),
      },
      score,
      rejectedBecause: null,
    };

    // ---- hard eligibility filters ----------------------------------------
    const reason = firstFailure(agent, context);
    if (reason) {
      rejected.push({ ...candidate, rejectedBecause: reason });
      continue;
    }

    eligible.push(candidate);
  }

  const sortCandidates = (list: ScoredCandidate[]) =>
    [...list].sort(
      (a, b) =>
        b.score - a.score ||
        (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY) ||
        a.activeOrders - b.activeOrders,
    );

  // Preferred shortlist: inside the service radius, or at least in the right zone.
  const withinRadius = eligible.filter(
    (c) =>
      (c.distanceKm !== null && c.distanceKm <= maxKm) ||
      c.signals.zoneMatch === 1,
  );

  let ranked = sortCandidates(withinRadius);
  let widenedSearch = false;

  if (ranked.length === 0 && eligible.length > 0) {
    // Thin coverage: rather than leaving the order unassigned, drop the radius
    // constraint and flag the decision for the dispatcher.
    ranked = sortCandidates(eligible);
    widenedSearch = true;
  }

  const chosen = ranked[0] ?? null;

  return {
    chosen,
    ranked,
    rejected: rejected.sort((a, b) => b.score - a.score),
    widenedSearch,
    reason: describeDecision(chosen, ranked.length, widenedSearch, rejected.length, maxKm),
  };
}

function firstFailure(agent: AgentWithRelations, context: AssignmentContext): string | null {
  if (!agent.user.isActive) return 'Account deactivated';
  if (context.excludeAgentId && agent.id === context.excludeAgentId) {
    return 'Excluded — previous attempt by this agent failed';
  }
  if (agent.availability !== 'AVAILABLE') {
    return `Not available (${agent.availability.toLowerCase().replace('_', ' ')})`;
  }
  if (agent.activeOrderCount >= agent.maxConcurrentOrders) {
    return `At capacity (${agent.activeOrderCount}/${agent.maxConcurrentOrders} active orders)`;
  }
  if (!canCarry(agent.vehicleType, context.chargeableWeightKg)) {
    return `${agent.vehicleType} cannot carry ${context.chargeableWeightKg} kg (limit ${
      VEHICLE_CAPACITY_KG[agent.vehicleType as VehicleType]
    } kg)`;
  }
  return null;
}

function describeDecision(
  chosen: ScoredCandidate | null,
  shortlisted: number,
  widened: boolean,
  rejectedCount: number,
  maxKm: number,
): string {
  if (!chosen) {
    return rejectedCount > 0
      ? `No eligible agent — all ${rejectedCount} agents were filtered out (availability, capacity or vehicle limits).`
      : 'No delivery agents exist in the system yet.';
  }

  const bits = [
    `${chosen.agentName} scored ${chosen.score.toFixed(3)} out of ${shortlisted} eligible agent${shortlisted === 1 ? '' : 's'}`,
  ];
  if (chosen.distanceKm !== null) bits.push(`${chosen.distanceKm} km from pickup`);
  if (chosen.signals.zoneMatch === 1) bits.push('operates in the pickup zone');
  bits.push(`${chosen.activeOrders}/${chosen.maxConcurrentOrders} active orders`);
  if (widened) bits.push(`search widened beyond the ${maxKm} km radius — no local agent was free`);

  return `${bits.join(' · ')}.`;
}
