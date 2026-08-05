/**
 * Core domain types. Pure data — no SDK or DOM dependencies.
 */

/** A geographic point in decimal degrees (WGS-84). */
export interface LatLon {
  lat: number;
  lon: number;
}

/** A named fix / waypoint / airport in the route. */
export interface Waypoint extends LatLon {
  /** Short identifier shown on the HUD, e.g. "OMDB", "NOKIT". */
  ident: string;
  /** Optional human-readable name. */
  name?: string;
  /** Classification, used only for display/search grouping. */
  kind?: 'airport' | 'fix' | 'vor' | 'ndb' | 'user';
}

/**
 * A position/velocity fix as delivered by the position source.
 * Speeds/altitudes are in SI here (m, m/s); the HUD converts to aviation units
 * at the display edge so all math stays in one unit system.
 */
export interface Position {
  lat: number;
  lon: number;
  /** Geometric GPS altitude in metres (NOT pressure altitude / flight level). */
  altitudeM?: number;
  /** Ground speed in metres/second. */
  speedMps?: number;
  /** Ground track in degrees true, 0..360. */
  trackDeg?: number;
  /** Horizontal accuracy estimate in metres. */
  accuracyM?: number;
  /** Fix time (epoch ms). */
  timestamp: number;
}

/** Guidance derived from the active flight plan and current position. */
export interface Guidance {
  /** The "TO" waypoint currently being navigated to. */
  activeWaypoint: Waypoint | null;
  /** The "FROM" waypoint that defines the active leg, if any. */
  legFrom: Waypoint | null;
  /** Great-circle bearing to the active waypoint, degrees true 0..360. */
  bearingToActiveDeg: number | null;
  /** Great-circle distance to the active waypoint, nautical miles. */
  distToActiveNm: number | null;
  /** Signed cross-track error to the active leg, nm. Positive = right of course. */
  xtkNm: number | null;
  /** Estimated time en route to the active waypoint, seconds (null if too slow). */
  eteToActiveSec: number | null;
  /** Remaining distance to the final destination along the route, nm. */
  distToDestNm: number | null;
  /** Estimated time en route to the destination, seconds. */
  eteToDestSec: number | null;
}
