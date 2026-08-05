/**
 * Unit conversions and glanceable formatting for aviation display.
 * Math elsewhere stays in SI; conversion happens only at the display edge.
 */
import { normalizeDeg } from './geo.js';

export const MPS_TO_KNOTS = 1.9438444924406;
export const METERS_TO_FEET = 3.280839895013;
export const KNOTS_TO_MPS = 1 / MPS_TO_KNOTS;

export const mpsToKnots = (mps: number): number => mps * MPS_TO_KNOTS;
export const knotsToMps = (kt: number): number => kt * KNOTS_TO_MPS;
export const metersToFeet = (m: number): number => m * METERS_TO_FEET;

/** Heading/track as a zero-padded 3-digit string, e.g. 7 -> "007". */
export function formatDeg(deg: number | null | undefined): string {
  if (deg == null || !Number.isFinite(deg)) return '---';
  return String(Math.round(normalizeDeg(deg))).padStart(3, '0');
}

/** Ground speed in knots, rounded, no decimals (e.g. "448"). */
export function formatKnots(mps: number | null | undefined): string {
  if (mps == null || !Number.isFinite(mps)) return '---';
  return String(Math.round(mpsToKnots(mps)));
}

/** Altitude in feet with a thousands separator (e.g. "37,020"). */
export function formatFeet(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return '-----';
  return Math.round(metersToFeet(m)).toLocaleString('en-US');
}

/** Distance in nautical miles; one decimal under 100 nm, whole numbers above. */
export function formatNm(nm: number | null | undefined): string {
  if (nm == null || !Number.isFinite(nm)) return '---';
  if (nm < 100) return nm.toFixed(1);
  return String(Math.round(nm));
}
