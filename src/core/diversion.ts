/**
 * Diversion module: rank nearby alternates by suitability then proximity, and
 * express each relative to the aircraft (bearing, track-relative bearing,
 * distance, ETE) so the HUD can plot them track-up.
 *
 * "Suitability" here is a caller-supplied boolean standing in for a real
 * weather/NOTAM/runway check — the geometry is real, the go/no-go is a stub.
 */
import { initialBearingDeg, distanceNm, angleDiffDeg } from './geo.js';
import { eteSeconds } from './time.js';
import type { LatLon, Waypoint } from './types.js';

export interface AlternateCandidate {
  waypoint: Waypoint;
  /** Go/no-go from weather/NOTAM/runway analysis (stubbed for now). */
  suitable: boolean;
}

export interface Alternate {
  waypoint: Waypoint;
  /** True bearing from the aircraft to the field, degrees [0,360). */
  bearingDeg: number;
  /** Bearing relative to ground track, degrees (-180,180]. + = right. */
  relBearingDeg: number;
  /** Great-circle distance, nautical miles. */
  distanceNm: number;
  /** Estimated time en route at current ground speed, seconds (or null). */
  eteSec: number | null;
  suitable: boolean;
  /** The single recommended field (nearest suitable within range). */
  best: boolean;
  /** Likely runway in use (into wind), set by the caller from weather data. */
  runway?: string | null;
  /** Forecast conditions as VMC ('V') / IMC ('I'), set by the caller. */
  wx?: 'V' | 'I' | null;
}

export interface DiversionOptions {
  /** Only include fields within this range, nm. */
  maxRangeNm?: number;
  /** Cap on how many alternates to return (nearest-first after ranking). */
  limit?: number;
}

/**
 * Compute ranked alternates from the current position/track/ground speed.
 * The result is sorted best-first: suitable fields ahead of unsuitable ones,
 * then by increasing distance. Exactly one entry (the top suitable field in
 * range) is flagged `best`.
 */
export function computeAlternates(
  pos: LatLon,
  trackDeg: number | null,
  gsKt: number | null,
  candidates: AlternateCandidate[],
  opts: DiversionOptions = {},
): Alternate[] {
  const maxRange = opts.maxRangeNm ?? 250;
  const track = trackDeg ?? 0;

  const alternates: Alternate[] = candidates
    .map((c) => {
      const bearingDeg = initialBearingDeg(pos, c.waypoint);
      const dist = distanceNm(pos, c.waypoint);
      return {
        waypoint: c.waypoint,
        bearingDeg,
        relBearingDeg: angleDiffDeg(bearingDeg, track),
        distanceNm: dist,
        eteSec: eteSeconds(dist, gsKt),
        suitable: c.suitable,
        best: false,
      };
    })
    .filter((a) => a.distanceNm <= maxRange)
    .sort((a, b) => {
      // Suitable first, then nearest.
      if (a.suitable !== b.suitable) return a.suitable ? -1 : 1;
      return a.distanceNm - b.distanceNm;
    });

  const best = alternates.find((a) => a.suitable);
  if (best) best.best = true;

  return typeof opts.limit === 'number' ? alternates.slice(0, opts.limit) : alternates;
}
