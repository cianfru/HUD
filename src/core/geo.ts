/**
 * Great-circle geodesy on a spherical earth. Accurate to well within the
 * tolerance any GPS-derived HUD needs for enroute navigation.
 *
 * Formulas follow the standard references (Ed Williams' Aviation Formulary /
 * Chris Veness' "Movable Type" pages). All angles in degrees at the API edge,
 * radians internally.
 */
import type { LatLon } from './types.js';

/** Mean earth radius in nautical miles. */
export const EARTH_RADIUS_NM = 3440.065;

export const toRad = (deg: number): number => (deg * Math.PI) / 180;
export const toDeg = (rad: number): number => (rad * 180) / Math.PI;

/** Normalise an angle to the range [0, 360). */
export function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Smallest signed difference `a - b` wrapped to (-180, 180].
 * Positive result means `a` is clockwise (to the right) of `b`.
 */
export function angleDiffDeg(a: number, b: number): number {
  let d = normalizeDeg(a) - normalizeDeg(b);
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/**
 * Initial great-circle bearing from `from` to `to`, degrees true [0, 360).
 */
export function initialBearingDeg(from: LatLon, to: LatLon): number {
  const φ1 = toRad(from.lat);
  const φ2 = toRad(to.lat);
  const Δλ = toRad(to.lon - from.lon);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return normalizeDeg(toDeg(Math.atan2(y, x)));
}

/** Great-circle (haversine) distance between two points, nautical miles. */
export function distanceNm(from: LatLon, to: LatLon): number {
  const φ1 = toRad(from.lat);
  const φ2 = toRad(to.lat);
  const Δφ = toRad(to.lat - from.lat);
  const Δλ = toRad(to.lon - from.lon);
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_NM * c;
}

/**
 * Signed cross-track distance of `point` from the great-circle leg
 * `start` -> `end`, nautical miles.
 *
 * Sign convention (aviation CDI): **positive = point is right of course**
 * (aircraft right of track ⇒ fly left). Negative = left of course.
 */
export function crossTrackNm(point: LatLon, start: LatLon, end: LatLon): number {
  const δ13 = distanceNm(start, point) / EARTH_RADIUS_NM; // angular
  const θ13 = toRad(initialBearingDeg(start, point));
  const θ12 = toRad(initialBearingDeg(start, end));
  const dxt = Math.asin(Math.sin(δ13) * Math.sin(θ13 - θ12));
  return dxt * EARTH_RADIUS_NM;
}

/**
 * Along-track distance: how far along the `start` -> `end` leg the closest
 * point to `point` lies, measured from `start`, nautical miles. Can exceed the
 * leg length (past the end) or go negative (before the start).
 */
export function alongTrackNm(point: LatLon, start: LatLon, end: LatLon): number {
  const δ13 = distanceNm(start, point) / EARTH_RADIUS_NM;
  const dxt = crossTrackNm(point, start, end) / EARTH_RADIUS_NM;
  // Guard the ratio against tiny floating point excursions outside [-1, 1].
  const ratio = Math.min(1, Math.max(-1, Math.cos(δ13) / Math.cos(dxt)));
  const dat = Math.acos(ratio);
  // Sign: negative when the closest point is "behind" the start.
  const ahead = Math.abs(angleDiffDeg(initialBearingDeg(start, point), initialBearingDeg(start, end))) <= 90;
  return (ahead ? dat : -dat) * EARTH_RADIUS_NM;
}

/**
 * Destination point reached by travelling `distNm` from `start` along an
 * initial `bearingDeg`. Used by the flight simulator to move the aircraft.
 */
export function destinationPoint(start: LatLon, bearingDeg: number, distNm: number): LatLon {
  const δ = distNm / EARTH_RADIUS_NM;
  const θ = toRad(bearingDeg);
  const φ1 = toRad(start.lat);
  const λ1 = toRad(start.lon);
  const sinφ2 = Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ);
  const φ2 = Math.asin(sinφ2);
  const y = Math.sin(θ) * Math.sin(δ) * Math.cos(φ1);
  const x = Math.cos(δ) - Math.sin(φ1) * sinφ2;
  const λ2 = λ1 + Math.atan2(y, x);
  return {
    lat: toDeg(φ2),
    lon: ((toDeg(λ2) + 540) % 360) - 180, // normalise lon to [-180, 180)
  };
}
