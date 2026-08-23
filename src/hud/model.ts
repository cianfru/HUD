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
  /**
   * Closest usable enroute alternate for CRUISE: bearing/distance, likely
   * (into-wind) runway, and forecast conditions as 'V' (VMC) / 'I' (IMC).
   */
  closestAlternate: {
    ident: string;
    bearingDeg: number;
    distanceNm: number;
    runway: string | null;
    wx: 'V' | 'I' | null;
  } | null;
  /** Critical phase (below ~1500 ft): the HUD declutters to GS only. */
  criticalPhase: boolean;
  /** DIVERT list: index of the highlighted alternate (press cycles it). */
  divertSelection: number;
  /** DIVERT: when true, show the selected alternate's raw METAR/TAF card. */
  divertExpanded: boolean;
  /** The selected alternate's weather detail (raw METAR/TAF + per-check report). */
  selectedWx: {
    ident: string;
    report: SuitabilityReport;
    metarRaw?: string;
    tafRaw?: string;
  } | null;
}
