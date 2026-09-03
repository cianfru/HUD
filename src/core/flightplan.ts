/**
 * Flight plan model: an ordered list of waypoints with an "active" (TO)
 * waypoint. Guidance (bearing, distance, cross-track, ETE, destination ETA) is
 * derived from the active leg and the current position.
 *
 * This is deliberately simple and honest: there is no FMS coupling. The route
 * is whatever the pilot loads/enters; the HUD advises, it does not command.
 */
import { distanceNm, initialBearingDeg, crossTrackNm, alongTrackNm } from './geo.js';
import { mpsToKnots } from './units.js';
import { eteSeconds } from './time.js';
import type { Waypoint, Position, Guidance } from './types.js';

/** Default radius (nm) within which the active waypoint is considered passed. */
export const DEFAULT_CAPTURE_NM = 2.0;

export class FlightPlan {
  readonly waypoints: Waypoint[];
  /** Index of the active "TO" waypoint. The "FROM" waypoint is the previous one. */
  private activeIndex: number;
  /**
   * Planned total route distance (NM) from the OFP, when known. For a direct
   * dep->dest plan this scales the straight-line remaining up to the real routed
   * distance (which includes detours around airspace), so the ETA reflects the
   * flown route, not a great-circle shortcut.
   */
  plannedDistanceNm?: number;

  constructor(waypoints: Waypoint[], activeIndex = 1) {
    this.waypoints = waypoints;
    // Active must be a real "TO" waypoint (index >= 1 when we have a FROM).
    // For a single-waypoint plan the active is index 0 (direct-to).
    const minIdx = waypoints.length > 1 ? 1 : 0;
    this.activeIndex = clamp(activeIndex, minIdx, Math.max(minIdx, waypoints.length - 1));
  }

  get length(): number {
    return this.waypoints.length;
  }

  get activeWaypoint(): Waypoint | null {
    return this.waypoints[this.activeIndex] ?? null;
  }

  /** The leg's origin waypoint (the one behind us), or null on a direct-to. */
  get legFrom(): Waypoint | null {
    if (this.activeIndex <= 0) return null;
    return this.waypoints[this.activeIndex - 1] ?? null;
  }

  get destination(): Waypoint | null {
    return this.waypoints[this.waypoints.length - 1] ?? null;
  }

  get activeWaypointIndex(): number {
    return this.activeIndex;
  }

  /** Advance to the next waypoint. Returns false if already at the destination. */
  next(): boolean {
    if (this.activeIndex >= this.waypoints.length - 1) return false;
    this.activeIndex += 1;
    return true;
  }

  /** Step back to the previous waypoint. Returns false if already at the first leg. */
  prev(): boolean {
    const minIdx = this.waypoints.length > 1 ? 1 : 0;
    if (this.activeIndex <= minIdx) return false;
    this.activeIndex -= 1;
    return true;
  }

  /** Directly select a waypoint by index as the active "TO". */
  setActive(index: number): void {
    const minIdx = this.waypoints.length > 1 ? 1 : 0;
    this.activeIndex = clamp(index, minIdx, this.waypoints.length - 1);
  }

  /**
   * Auto-sequence: if within `captureNm` of the active waypoint (and it is not
   * the destination), advance to the next leg. Returns true if it sequenced.
   */
  autoSequence(pos: Position, captureNm = DEFAULT_CAPTURE_NM): boolean {
    const active = this.activeWaypoint;
    if (!active) return false;
    if (this.activeIndex >= this.waypoints.length - 1) return false; // hold at dest
    const d = distanceNm(pos, active);
    if (d <= captureNm) return this.next();
    return false;
  }

  /** Compute live guidance from the current position. */
  guidance(pos: Position): Guidance {
    const active = this.activeWaypoint;
    if (!active) {
      return {
        activeWaypoint: null,
        legFrom: null,
        bearingToActiveDeg: null,
        distToActiveNm: null,
        xtkNm: null,
        eteToActiveSec: null,
        distToDestNm: null,
        eteToDestSec: null,
      };
    }

    const gsKt = pos.speedMps != null ? mpsToKnots(pos.speedMps) : null;
    const distToActive = distanceNm(pos, active);
    const bearingToActive = initialBearingDeg(pos, active);

    const from = this.legFrom;
    const xtk = from ? crossTrackNm(pos, from, active) : null;

    // Remaining distance to destination = distance to active + sum of the
    // remaining route legs beyond the active waypoint.
    let distToDest = distToActive;
    for (let i = this.activeIndex; i < this.waypoints.length - 1; i++) {
      distToDest += distanceNm(this.waypoints[i]!, this.waypoints[i + 1]!);
    }

    // Direct dep->dest plans understate the distance when the real routing
    // detours (e.g. avoiding airspace). If the OFP's planned distance is known,
    // scale the straight-line remaining by the route's overall stretch factor so
    // the ETA matches the flown route. Plans with real intermediate legs already
    // sum their legs, so they are left untouched.
    let remainingNm = distToDest;
    if (this.plannedDistanceNm && this.waypoints.length <= 2) {
      const dep = this.waypoints[0];
      const dest = this.destination;
      if (dep && dest) {
        const direct = distanceNm(dep, dest);
        if (direct > 0) remainingNm = distToDest * Math.max(1, this.plannedDistanceNm / direct);
      }
    }

    return {
      activeWaypoint: active,
      legFrom: from,
      bearingToActiveDeg: bearingToActive,
      distToActiveNm: distToActive,
      xtkNm: xtk,
      eteToActiveSec: eteSeconds(distToActive, gsKt),
      distToDestNm: remainingNm,
      eteToDestSec: eteSeconds(remainingNm, gsKt),
    };
  }
}

/** Progress along the active leg as a 0..1 fraction (for a progress readout). */
export function legProgress(plan: FlightPlan, pos: Position): number | null {
  const from = plan.legFrom;
  const to = plan.activeWaypoint;
  if (!from || !to) return null;
  const legLen = distanceNm(from, to);
  if (legLen <= 0) return null;
  const along = alongTrackNm(pos, from, to);
  return clamp(along / legLen, 0, 1);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
