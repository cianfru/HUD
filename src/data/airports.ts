/**
 * Worldwide airport lookup for the phone MVP: real ICAO large + medium airports
 * (from OurAirports, CC0). Used to surface fields near wherever the phone is.
 * Not a navigation database; no runway/approach detail here.
 */
import raw from './airports.json';
import { distanceNm } from '../core/geo.js';
import type { LatLon, Waypoint } from '../core/types.js';

interface AirportFile {
  fmt: string[];
  airports: [string, number, number, string][]; // [ident, lat, lon, name]
}

const AIRPORTS: Waypoint[] = (raw as AirportFile).airports.map(([ident, lat, lon, name]) => ({
  ident,
  lat,
  lon,
  name,
  kind: 'airport' as const,
}));

export function airportCount(): number {
  return AIRPORTS.length;
}

/** The `limit` nearest airports within `maxNm`, nearest first. */
export function nearbyAirports(pos: LatLon, maxNm = 250, limit = 12): Waypoint[] {
  const within: Array<{ a: Waypoint; d: number }> = [];
  for (const a of AIRPORTS) {
    // Cheap bounding-box reject before the haversine (≈ deg → nm).
    if (Math.abs(a.lat - pos.lat) * 60 > maxNm) continue;
    const d = distanceNm(pos, a);
    if (d <= maxNm) within.push({ a, d });
  }
  within.sort((x, y) => x.d - y.d);
  return within.slice(0, limit).map((x) => x.a);
}
