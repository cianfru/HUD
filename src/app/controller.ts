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
      case 'doublePress':
        // The G2 does not reliably relay single taps to an app — only swipes
        // and double-taps come through dependably. So BOTH map to the same
        // "activate" action (debounced, in case a unit emits click+doubleclick
        // for one physical double-tap), and no action depends on telling a
        // single tap from a double tap.
        this.activate();
        break;
    }
    this.draw();
  }

  // Navigation grammar, built only on gestures the G2 delivers reliably:
  //   swipe up/down  = move (between pages at the top level; browse/scroll once
  //                    drilled in)
  //   tap (any)      = activate: enter a page's detail, or act on the highlighted
  //                    setting. Double-tap in DIVERT detail steps back out.
  // `divertSelection` is which alternate the detail browser is showing;
  // `settingsSelection` is the highlighted SETTINGS row.
  private focus: HudFocus = 'page';
  private divertSelection = 0;
  private settingsSelection = 0;
  private lastAltCount = 0;
  private lastActivateMs = 0;
  private criticalPhase = false;

  // SETTINGS rows, in order: two toggles then a Back row (activating Back exits).
  private static readonly SETTINGS_CLOCK = 0;
  private static readonly SETTINGS_AUTOSEQ = 1;
  private static readonly SETTINGS_BACK = 2;
  private static readonly SETTINGS_ROWS = 3;
  /** Collapse a click+double-click pair from one physical tap into one action. */
  private static readonly ACTIVATE_DEBOUNCE_MS = 350;

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

  // Swipe = move at the current level: change page at the top; browse the
  // alternates in DIVERT detail; move the highlighted row in SETTINGS. Swipe
  // never changes page once drilled in, so paging stays separate from scrolling.
  private onSwipe(dir: 1 | -1): void {
    if (this.focus === 'page') {
      this.cycleView(dir);
    } else if (this.view === 'DIVERT' && this.lastAltCount > 0) {
      this.divertSelection = clamp(this.divertSelection + dir, 0, this.lastAltCount - 1);
    } else if (this.view === 'SETTINGS') {
      this.settingsSelection = clamp(this.settingsSelection + dir, 0, HudController.SETTINGS_ROWS - 1);
    }
  }

  /**
   * Activate (any tap). At the page level it drills into the current page's
   * detail; inside a page it acts on what's shown. Debounced so a click+
   * double-click pair from one physical tap counts once.
   */
  private activate(): void {
    const t = this.now();
    if (t - this.lastActivateMs < HudController.ACTIVATE_DEBOUNCE_MS) return;
    this.lastActivateMs = t;

    if (this.focus === 'page') {
      // Enter the page's detail. CRUISE/DEST have none — they show everything.
      if (this.view === 'DIVERT' && this.lastAltCount > 0) {
        this.focus = 'detail';
        this.divertSelection = 0;
      } else if (this.view === 'SETTINGS') {
        this.focus = 'list';
        this.settingsSelection = 0;
      }
      return;
    }
    if (this.view === 'DIVERT' && this.focus === 'detail') {
      this.focus = 'page'; // done reading the weather -> back to the pages
    } else if (this.view === 'SETTINGS' && this.focus === 'list') {
      this.activateSetting();
    }
  }

  /** Act on the highlighted SETTINGS row: toggle a setting, or Back exits. */
  private activateSetting(): void {
    switch (this.settingsSelection) {
      case HudController.SETTINGS_CLOCK:
        this.config.clock = this.config.clock === 'utc' ? 'local' : 'utc';
        break;
      case HudController.SETTINGS_AUTOSEQ:
        this.config.autoSequence = !this.config.autoSequence;
        break;
      case HudController.SETTINGS_BACK:
        this.focus = 'page';
        break;
    }
  }

  private cycleView(dir: 1 | -1): void {
    const i = VIEW_ORDER.indexOf(this.view);
    const n = VIEW_ORDER.length;
    this.view = VIEW_ORDER[(i + dir + n) % n]!;
    // Changing page always returns to the page level with fresh cursors.
    this.focus = 'page';
    this.divertSelection = 0;
    this.settingsSelection = 0;
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
      settingsSelection: this.settingsSelection,
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

/** Clamp `n` into the inclusive range [lo, hi]. */
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
