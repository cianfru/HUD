/**
 * Simulated position source: flies an aircraft along a list of waypoints at a
 * cruise speed, so the HUD can be developed and demoed without hardware.
 *
 * Emits realistic Position fixes (lat/lon, ground speed, track, GPS altitude)
 * on a fixed cadence, optionally time-accelerated. A slow lateral "wander" is
 * added so the cross-track CDI shows life.
 */
import { destinationPoint, initialBearingDeg, distanceNm } from '../../core/geo.js';
import { knotsToMps } from '../../core/units.js';
import type { LatLon, Position, Waypoint } from '../../core/types.js';
import type { PositionSource, PositionListener } from './source.js';

export interface SimOptions {
  /** Cruise ground speed, knots. */
  cruiseKt?: number;
  /** GPS (geometric) altitude, feet. */
  cruiseAltFt?: number;
  /** Fix cadence, milliseconds of wall-clock between fixes. */
  updateMs?: number;
  /** Simulated-time multiplier (e.g. 20 = fly 20x faster than real time). */
  timeScale?: number;
  /** Peak lateral wander off the course line, nautical miles. */
  wanderNm?: number;
  /** now() injection for testing. */
  now?: () => number;
}

const FT_TO_M = 0.3048;

export class SimulatedPositionSource implements PositionSource {
  private readonly legs: Waypoint[];
  private readonly cruiseKt: number;
  private readonly altM: number;
  private readonly updateMs: number;
  private timeScale: number;
  private readonly wanderNm: number;
  private readonly now: () => number;

  private timer: ReturnType<typeof setInterval> | null = null;
  private pos: LatLon;
  private targetIndex: number;
  private elapsedSec = 0;

  constructor(waypoints: Waypoint[], opts: SimOptions = {}) {
    if (waypoints.length < 2) {
      throw new Error('SimulatedPositionSource needs at least two waypoints');
    }
    this.legs = waypoints;
    this.cruiseKt = opts.cruiseKt ?? 450;
    this.altM = (opts.cruiseAltFt ?? 37000) * FT_TO_M;
    this.updateMs = opts.updateMs ?? 1000;
    this.timeScale = opts.timeScale ?? 30;
    this.wanderNm = opts.wanderNm ?? 0.6;
    this.now = opts.now ?? (() => Date.now());

    this.pos = { lat: waypoints[0]!.lat, lon: waypoints[0]!.lon };
    this.targetIndex = 1;
  }

  start(onFix: PositionListener): void {
    this.stop();
    this.timer = setInterval(() => {
      onFix(this.step());
    }, this.updateMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Adjust the simulated-time multiplier (clamped to a sane range). */
  setTimeScale(scale: number): number {
    this.timeScale = Math.min(200, Math.max(1, scale));
    return this.timeScale;
  }

  getTimeScale(): number {
    return this.timeScale;
  }

  /** Advance the simulation by one tick and return the new fix. Exposed for tests. */
  step(): Position {
    const target = this.legs[this.targetIndex]!;
    const simSeconds = (this.updateMs / 1000) * this.timeScale;
    this.elapsedSec += simSeconds;

    const gsMps = knotsToMps(this.cruiseKt);
    let stepNm = (gsMps * simSeconds) / 1852; // metres -> nm

    // Walk along legs, consuming waypoints if we overrun the current target.
    let bearing = initialBearingDeg(this.pos, target);
    while (stepNm > 0) {
      const distToTarget = distanceNm(this.pos, this.legs[this.targetIndex]!);
      bearing = initialBearingDeg(this.pos, this.legs[this.targetIndex]!);
      if (stepNm < distToTarget || this.targetIndex >= this.legs.length - 1) {
        this.pos = destinationPoint(this.pos, bearing, Math.min(stepNm, distToTarget));
        stepNm = 0;
      } else {
        // Snap onto the waypoint and continue toward the next one.
        this.pos = { lat: this.legs[this.targetIndex]!.lat, lon: this.legs[this.targetIndex]!.lon };
        stepNm -= distToTarget;
        this.targetIndex += 1;
      }
    }

    // Lateral wander (perpendicular to track) for a lively CDI.
    let emit: LatLon = this.pos;
    if (this.wanderNm > 0) {
      const offset = this.wanderNm * Math.sin(this.elapsedSec / 120);
      emit = destinationPoint(this.pos, bearing + 90, offset);
    }

    return {
      lat: emit.lat,
      lon: emit.lon,
      altitudeM: this.altM,
      speedMps: gsMps,
      trackDeg: bearing,
      accuracyM: 3.5,
      timestamp: this.now(),
    };
  }

  /** True once the aircraft has reached the final waypoint. */
  get finished(): boolean {
    const last = this.legs[this.legs.length - 1]!;
    return this.targetIndex >= this.legs.length - 1 && distanceNm(this.pos, last) < 0.5;
  }
}
