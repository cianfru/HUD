/**
 * Bundled navigation data (offline).
 *
 * SCOPE / HONESTY NOTE: this is a *small illustrative* dataset for the demo and
 * for resolving common airport idents — it is NOT a certified or complete
 * navigation database. Airport coordinates are the published reference points;
 * the enroute "GLFxx" fixes in the demo route are synthetic placeholders for
 * demonstration only and must never be used for real navigation.
 */
import type { Waypoint } from '../core/types.js';

/** A handful of real airports (ICAO), by reference point. Extend as needed. */
export const AIRPORTS: Record<string, Waypoint> = {
  OTHH: { ident: 'OTHH', name: 'Doha / Hamad Intl', lat: 25.2731, lon: 51.6081, kind: 'airport' },
  OMDB: { ident: 'OMDB', name: 'Dubai Intl', lat: 25.2528, lon: 55.3644, kind: 'airport' },
  OMDW: { ident: 'OMDW', name: 'Dubai / Al Maktoum', lat: 24.8968, lon: 55.1614, kind: 'airport' },
  OMSJ: { ident: 'OMSJ', name: 'Sharjah Intl', lat: 25.3286, lon: 55.5172, kind: 'airport' },
  OMFJ: { ident: 'OMFJ', name: 'Fujairah Intl', lat: 25.1122, lon: 56.324, kind: 'airport' },
  OMAA: { ident: 'OMAA', name: 'Abu Dhabi Intl', lat: 24.433, lon: 54.6511, kind: 'airport' },
  OBBI: { ident: 'OBBI', name: 'Bahrain Intl', lat: 26.2708, lon: 50.6336, kind: 'airport' },
  OKBK: { ident: 'OKBK', name: 'Kuwait Intl', lat: 29.2266, lon: 47.9689, kind: 'airport' },
  OEDF: { ident: 'OEDF', name: 'Dammam / King Fahd', lat: 26.4712, lon: 49.7979, kind: 'airport' },
  OOMS: { ident: 'OOMS', name: 'Muscat Intl', lat: 23.5933, lon: 58.2844, kind: 'airport' },
  LTFM: { ident: 'LTFM', name: 'Istanbul', lat: 41.2753, lon: 28.7519, kind: 'airport' },
  HECA: { ident: 'HECA', name: 'Cairo Intl', lat: 30.1219, lon: 31.4056, kind: 'airport' },
  EGLL: { ident: 'EGLL', name: 'London / Heathrow', lat: 51.47, lon: -0.4543, kind: 'airport' },
};

/**
 * Synthetic enroute fixes used only by the demo route (Gulf corridor, roughly
 * OTHH -> OMDB). Named GLFxx to make clear they are illustrative.
 */
export const DEMO_FIXES: Record<string, Waypoint> = {
  GLF01: { ident: 'GLF01', lat: 25.27, lon: 52.55, kind: 'fix' },
  GLF02: { ident: 'GLF02', lat: 25.26, lon: 53.5, kind: 'fix' },
  GLF03: { ident: 'GLF03', lat: 25.255, lon: 54.45, kind: 'fix' },
};

/**
 * Resolve an ident to a waypoint from the bundled data. Case-insensitive.
 * Also accepts a decimal "lat,lon" token (e.g. "25.27,51.60").
 */
export function findWaypoint(token: string): Waypoint | null {
  const t = token.trim().toUpperCase();
  if (!t) return null;
  if (AIRPORTS[t]) return AIRPORTS[t]!;
  if (DEMO_FIXES[t]) return DEMO_FIXES[t]!;

  // Decimal "lat,lon" user waypoint.
  const m = t.match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
  if (m) {
    const lat = Number(m[1]);
    const lon = Number(m[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      return { ident: 'USER', lat, lon, kind: 'user' };
    }
  }
  return null;
}

/** The demo flight plan route string (Doha -> Dubai, Gulf corridor). */
export const DEMO_ROUTE_STRING = 'OTHH DCT GLF01 GLF02 GLF03 DCT OMDB';

/**
 * Candidate diversion alternates for the demo (UAE cluster ahead of the route).
 * The `suitable` flag stands in for a live weather/NOTAM check — a later
 * iteration would source it from METAR/TAF over Starlink. OMAA is marked
 * unsuitable here purely to demonstrate the hollow-ring (not-suitable) state.
 */
export const DEMO_ALTERNATES: Array<{ ident: string; suitable: boolean }> = [
  { ident: 'OMDB', suitable: true },
  { ident: 'OMDW', suitable: true },
  { ident: 'OMSJ', suitable: true },
  { ident: 'OMFJ', suitable: true },
  { ident: 'OMAA', suitable: false },
];
