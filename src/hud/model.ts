/**
 * The immutable snapshot the HUD views render from, and the set of views.
 */
import type { Position, Guidance } from '../core/types.js';
import type { FlightPlan } from '../core/flightplan.js';
import type { Alternate } from '../core/diversion.js';
import type { SuitabilityReport } from '../core/suitability.js';
import type { DeviceState } from '../bridge/bridge.js';

export type HudView = 'CRUISE' | 'DIVERT' | 'ROUTE' | 'SETTINGS';

/** Views in swipe order. */
export const VIEW_ORDER: HudView[] = ['CRUISE', 'DIVERT', 'ROUTE', 'SETTINGS'];

export interface HudConfig {
  clock: 'utc' | 'local';
  autoSequence: boolean;
}

export interface HudState {
  now: Date;
  position: Position | null;
  guidance: Guidance | null;
  plan: FlightPlan;
  device: DeviceState;
  config: HudConfig;
  /** Epoch ms when the flight timer started. */
  flightStartMs: number;
  /**
   * Offline diversion alternates from the briefing pack, best-first
   * (suitable-then-nearest). Null when no pack is loaded.
   */
  alternates: Alternate[] | null;
  /** Age of the loaded briefing pack, seconds — null when no pack is loaded. */
  briefingAgeSec: number | null;
  /** Closest usable enroute alternate + its likely (into-wind) runway, for CRUISE. */
  closestAlternate: { ident: string; bearingDeg: number; distanceNm: number; runway: string | null } | null;
  /** When true, the DIVERT page shows the best field's per-check reasons. */
  divertDetail: boolean;
  /** Transparent suitability for the best alternate (for the detail card). */
  bestReport: { ident: string; report: SuitabilityReport } | null;
}
