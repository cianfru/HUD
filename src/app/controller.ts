/**
 * The HUD controller: a small state machine wiring the position source and the
 * flight plan to the renderer, and mapping gestures to actions.
 *
 * Gesture map (works from temple touchpad or R1 ring):
 *   swipe down  -> next page      swipe up -> previous page
 *   press       -> context action (CRUISE: skip to next waypoint;
 *                                   SETTINGS: toggle auto-sequence)
 *   double-press-> toggle UTC / local clock
 */
import type { GlassesBridge, Gesture, DeviceState } from '../bridge/bridge.js';
import type { PositionSource } from '../data/position/source.js';
import { FlightPlan } from '../core/flightplan.js';
import { computeAlternates } from '../core/diversion.js';
import { mpsToKnots, metersToFeet } from '../core/units.js';
import { etaLocal } from '../core/time.js';
import type { Position } from '../core/types.js';
import type { BriefingStore } from '../data/briefing.js';
import type { Minima } from '../core/taf.js';
import { vmcImc } from '../core/suitability.js';
import type { SuitabilityMinima } from '../core/suitability.js';
import { HudRenderer } from '../hud/renderer.js';
import { VIEW_ORDER } from '../hud/model.js';
import type { HudView, HudFocus, HudState, HudConfig } from '../hud/model.js';

export interface DiversionOptions {
  maxRangeNm?: number;
  limit?: number;
  minRwyM?: number;
  minima?: Minima;
  /** Thresholds for the transparent per-check suitability report. */
  reasons?: SuitabilityMinima;
}

export interface ControllerOptions {
  config?: Partial<HudConfig>;
  /** Clock/derived-field refresh interval, ms. */
  tickMs?: number;
  now?: () => number;
  /**
   * Offline briefing pack. When present, the DIVERT page ranks its
   * A320-capable fields by cached-TAF suitability (at `now`) then proximity.
   */
  briefing?: BriefingStore;
  diversion?: DiversionOptions;
}

export class HudController {
  private readonly renderer: HudRenderer;
  private view: HudView = 'CRUISE';
  private position: Position | null = null;
  private device: DeviceState = { connected: false };
  private readonly config: HudConfig;
  private readonly tickMs: number;
  private readonly now: () => number;
  private readonly flightStartMs: number;
  private readonly briefing?: BriefingStore;
  private readonly diversion: DiversionOptions;

  private ticker: ReturnType<typeof setInterval> | null = null;
  private unsubscribers: Array<() => void> = [];

  constructor(
    private readonly bridge: GlassesBridge,
    private readonly positionSource: PositionSource,
    private readonly plan: FlightPlan,
    opts: ControllerOptions = {},
  ) {
    this.renderer = new HudRenderer(bridge);
    this.config = { clock: 'utc', autoSequence: true, ...opts.config };
    this.tickMs = opts.tickMs ?? 1000;
    this.now = opts.now ?? (() => Date.now());
    this.flightStartMs = this.now();
    this.briefing = opts.briefing;
    this.diversion = opts.diversion ?? {};
  }

  start(): void {
    this.unsubscribers.push(this.bridge.onGesture((g) => this.onGesture(g)));
    this.unsubscribers.push(this.bridge.onDeviceState((s) => this.onDeviceState(s)));

    this.positionSource.start((fix) => this.onFix(fix));

    // Periodic re-render so the clock, timer and ETA advance between fixes.
    this.ticker = setInterval(() => this.draw(), this.tickMs);
    this.draw();
  }

  stop(): void {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
    this.positionSource.stop();
    for (const u of this.unsubscribers) u();
    this.unsubscribers = [];
  }

  // --- inputs ---

  private onFix(fix: Position): void {
    this.position = fix;
    if (this.config.autoSequence) this.plan.autoSequence(fix);
    this.draw();
  }

  private onDeviceState(s: DeviceState): void {
    this.device = s;
    this.draw();
  }

  private onGesture(g: Gesture): void {
    switch (g.type) {
      case 'swipeDown':
        this.onSwipe(1);
        break;
      case 'swipeUp':
        this.onSwipe(-1);
        break;
      case 'press':
        this.onPress();
        break;
      case 'doublePress':
        this.onDoublePress();
        break;
    }
    this.draw();
  }

  // Two-level navigation. Swipe moves between pages at the top level and, once
  // drilled in, moves the selection cursor. Tap descends (page->list->detail);
  // double-press ascends. `divertSelection` is the cursor over the alternates.
  private focus: HudFocus = 'page';
  private divertSelection = 0;
  private lastAltCount = 0;
  private criticalPhase = false;

  /**
   * The CRUISE page declutters to GS only unless the aircraft is clearly in
   * cruise (high AND moving). So parked (gs~0), taxi, take-off, approach and
   * landing all show just GS; only established cruise shows the full strip. This
   * only affects the CRUISE page — every page stays reachable by swipe, so the
   * alternates and their weather can be checked on the ground. Hysteresis so GPS
   * noise can't flicker it; GPS geometric altitude is a height proxy (the `gs<30`
   * arm also covers parking at a high-elevation field).
   */
  private updateCriticalPhase(): void {
    const h = this.position?.altitudeM != null ? metersToFeet(this.position.altitudeM) : null;
    if (h == null) return; // no height info — hold the last state
    const gsKt = this.position?.speedMps != null ? mpsToKnots(this.position.speedMps) : 0;
    if (h > 1700 && gsKt > 40) this.criticalPhase = false; // established cruise -> full
    else if (h < 1500 || gsKt < 30) this.criticalPhase = true; // low or slow -> GS only
  }

  // Swipe = move laterally at the current level: change page when at the page
  // carousel, or move the selection cursor when drilled into a list/detail.
  // Swipe never changes page while drilled in — you back out with a double-tap
  // first — so paging stays predictable and separate from scrolling a list.
  private onSwipe(dir: 1 | -1): void {
    if (this.focus === 'page') {
      this.cycleView(dir);
      return;
    }
    // Inside DIVERT's list or a field's detail: move the cursor, clamped.
    if (this.view === 'DIVERT' && this.lastAltCount > 0) {
      this.divertSelection = Math.max(0, Math.min(this.lastAltCount - 1, this.divertSelection + dir));
    }
  }

  // Tap = descend: enter a page's list, then open the selected item's detail.
  // Pages with no deeper level (CRUISE, DEST) do their own primary action or
  // nothing; SETTINGS toggles auto-sequence in place.
  private onPress(): void {
    if (this.focus === 'page') {
      if (this.view === 'DIVERT' && this.lastAltCount > 0) this.focus = 'list';
      else if (this.view === 'SETTINGS') this.config.autoSequence = !this.config.autoSequence;
      return;
    }
    if (this.view === 'DIVERT' && this.focus === 'list') this.focus = 'detail';
  }

  // Double-tap = ascend: detail -> list -> page. At the page carousel there is
  // nothing above, so it toggles the clock (UTC/local) instead.
  private onDoublePress(): void {
    if (this.focus === 'detail') this.focus = 'list';
    else if (this.focus === 'list') this.focus = 'page';
    else this.config.clock = this.config.clock === 'utc' ? 'local' : 'utc';
  }

  private cycleView(dir: 1 | -1): void {
    const i = VIEW_ORDER.indexOf(this.view);
    const n = VIEW_ORDER.length;
    this.view = VIEW_ORDER[(i + dir + n) % n]!;
    // Changing page always returns to the page level with a fresh cursor.
    this.focus = 'page';
    this.divertSelection = 0;
  }

  // --- output ---

  private draw(): void {
    this.updateCriticalPhase();
    // Declutter affects only the CRUISE page (GS-only); pages stay navigable so
    // the alternates and their weather can be checked any time, incl. on ground.
    this.renderer.render(this.view, this.snapshot());
  }

  private snapshot(): HudState {
    const now = new Date(this.now());
    const guidance = this.position ? this.plan.guidance(this.position) : null;
    const { alternates, briefingAgeSec } = this.computeDiversion(now);
    const best = alternates?.find((a) => a.best) ?? alternates?.[0];
    const cat = this.briefing && best ? this.briefing.assess(best.waypoint.ident, now)?.category : null;
    const closestAlternate =
      this.briefing && best
        ? {
            ident: best.waypoint.ident,
            bearingDeg: best.bearingDeg,
            distanceNm: best.distanceNm,
            runway: this.briefing.runwayInUse(best.waypoint.ident, now),
            wx: vmcImc(cat),
          }
        : null;

    // DIVERT drill-down: clamp the cursor to what's shown (max 4), and gather the
    // selected field's raw METAR/TAF + per-check report for the detail card.
    const shown = Math.min(4, alternates?.length ?? 0);
    this.lastAltCount = shown;
    const sel = shown ? this.divertSelection % shown : 0;
    const selAlt = alternates?.[sel];
    const selectedWx =
      this.briefing && selAlt
        ? {
            ident: selAlt.waypoint.ident,
            report: this.briefing.report(selAlt.waypoint.ident, now, this.diversion.reasons)!,
            metarRaw: this.briefing.metarRaw(selAlt.waypoint.ident),
            tafRaw: this.briefing.tafRaw(selAlt.waypoint.ident),
          }
        : null;

    // DEST page: the destination's own arrival time + latest weather, so it can
    // be read in flight the same way as an alternate (the ROUTE list didn't).
    const dest = this.plan.destination;
    const destWx =
      this.briefing && dest
        ? {
            ident: dest.ident,
            arrivalLocal: this.position
              ? etaLocal(now, guidance?.eteToDestSec ?? null, dest.utcOffsetMin)
              : null,
            runway: this.briefing.runwayInUse(dest.ident, now),
            wx: vmcImc(this.briefing.assess(dest.ident, now)?.category),
            report: this.briefing.report(dest.ident, now, this.diversion.reasons),
            metarRaw: this.briefing.metarRaw(dest.ident),
            tafRaw: this.briefing.tafRaw(dest.ident),
          }
        : null;

    return {
      now,
      position: this.position,
      guidance,
      plan: this.plan,
      device: this.device,
      config: this.config,
      flightStartMs: this.flightStartMs,
      alternates,
      briefingAgeSec,
      closestAlternate,
      criticalPhase: this.criticalPhase,
      focus: this.focus,
      divertSelection: sel,
      selectedWx,
      destWx,
    };
  }

  /**
   * Rank the briefing pack's A320-capable fields for the DIVERT page, entirely
   * offline: candidacy + go/no-go from the cached TAF at `at`, geometry from the
   * current fix. Null alternates when no pack is loaded or no fix yet.
   */
  private computeDiversion(at: Date): {
    alternates: HudState['alternates'];
    briefingAgeSec: HudState['briefingAgeSec'];
  } {
    if (!this.briefing) return { alternates: null, briefingAgeSec: null };
    const briefingAgeSec = this.briefing.ageSec;
    if (!this.position) return { alternates: null, briefingAgeSec };
    const candidates = this.briefing.candidatesAt(
      at,
      this.diversion.minRwyM,
      this.diversion.minima,
    );
    const gsKt = this.position.speedMps != null ? mpsToKnots(this.position.speedMps) : null;
    const ranked = computeAlternates(
      this.position,
      this.position.trackDeg ?? null,
      gsKt,
      candidates,
      { maxRangeNm: this.diversion.maxRangeNm ?? 1000, limit: this.diversion.limit ?? 6 },
    );
    // Enrich each with its likely runway and VMC/IMC from the cached TAF.
    const briefing = this.briefing;
    const alternates = ranked.map((a) => ({
      ...a,
      runway: briefing.runwayInUse(a.waypoint.ident, at),
      wx: vmcImc(briefing.assess(a.waypoint.ident, at)?.category),
    }));
    return { alternates, briefingAgeSec };
  }
}
