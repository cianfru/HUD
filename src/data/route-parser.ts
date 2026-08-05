/**
 * Parse a filed-style route string into a list of waypoints.
 *
 * Supports the common shorthand a pilot would type or paste: space-separated
 * idents, with connectors ("DCT", "SID"/"STAR" placeholders) ignored. Airway
 * tokens (letters followed by digits, e.g. "UL425") cannot be expanded without
 * an airway database, so they are reported as unresolved rather than guessed.
 */
import type { Waypoint } from '../core/types.js';
import { findWaypoint } from './navdata.js';

export interface ParsedRoute {
  waypoints: Waypoint[];
  /** Tokens that could not be resolved (unknown fixes, airways). */
  unresolved: string[];
}

const CONNECTORS = new Set(['DCT', 'DIRECT', 'TO', '->', '.', 'SID', 'STAR']);
const AIRWAY = /^[A-Z]{1,2}\d+[A-Z]?$/; // e.g. UL425, J146, A1

export function parseRoute(
  route: string,
  resolve: (token: string) => Waypoint | null = findWaypoint,
): ParsedRoute {
  const tokens = route
    .toUpperCase()
    .split(/\s+/) // whitespace only: a "lat,lon" token must survive intact
    .map((t) => t.trim())
    .filter(Boolean);

  const waypoints: Waypoint[] = [];
  const unresolved: string[] = [];

  for (const token of tokens) {
    if (CONNECTORS.has(token)) continue;
    if (AIRWAY.test(token)) {
      unresolved.push(token);
      continue;
    }
    const wp = resolve(token);
    if (wp) {
      // Avoid consecutive duplicates (e.g. a fix repeated across a DCT).
      const last = waypoints[waypoints.length - 1];
      if (!last || last.ident !== wp.ident || last.lat !== wp.lat || last.lon !== wp.lon) {
        waypoints.push(wp);
      }
    } else {
      unresolved.push(token);
    }
  }

  return { waypoints, unresolved };
}
