/**
 * The immutable snapshot the HUD views render from, and the set of views.
 */
import type { Position, Guidance } from '../core/types.js';
import type { FlightPlan } from '../core/flightplan.js';
import type { Alternate } from '../core/diversion.js';
import type { SuitabilityReport } from '../core/suitability.js';
import type { DeviceState } from '../bridge/bridge.js';

export type HudView = 'CRUISE' | 'DIVERT' | 'DEST' | 'SETTINGS';

/** Top-level pages, in swipe order. Swipe moves between these; tap drills in. */
export const VIEW_ORDER: HudView[] = ['CRUISE', 'DIVERT', 'DEST', 'SETTINGS'];

/**
 * Navigation depth within the current page — the "leaves" of the structure:
 *  - 'page'   : the page carousel; swipe changes page, tap drills in.
 *  - 'list'   : inside a page's selectable list; swipe moves the cursor.
 *  - 'detail' : a selected item's detail card (e.g. an alternate's METAR/TAF).
 * Tap descends (page→list→detail); double-press ascends (detail→list→page).
 */
export type HudFocus = 'page' | 'list' | 'detail';

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
  /** CRUISE strip: true shows the full strip, false shows GS only (declutter).
   *  Driven by hold-to-reveal / tap-to-latch, suppressed in a critical phase. */
  cruiseFull: boolean;
  /** True when there is a last fix but none recently — GS/track are not current. */
  gpsStale: boolean;
  /** Navigation depth within the current page (page carousel / list / detail). */
  focus: HudFocus;
  /** DIVERT list: index of the highlighted alternate (swipe moves it in 'list'). */
  divertSelection: number;
  /** SETTINGS list: index of the highlighted setting (swipe moves it in 'list'). */
  settingsSelection: number;
  /** The selected alternate's weather detail (raw METAR/TAF + per-check report). */
  selectedWx: {
    ident: string;
    report: SuitabilityReport;
    metarRaw?: string;
    tafRaw?: string;
  } | null;
  /**
   * Destination weather for the DEST page: arrival local time, likely runway,
   * VMC/IMC, the per-check report and the raw METAR/TAF. Null when there is no
   * destination or no pack.
   */
  destWx: {
    ident: string;
    arrivalLocal: string | null;
    runway: string | null;
    wx: 'V' | 'I' | null;
    report: SuitabilityReport | null;
    metarRaw?: string;
    tafRaw?: string;
  } | null;
}
