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
import type { Position } from '../core/types.js';
import type { BriefingStore } from '../data/briefing.js';
import type { Minima } from '../core/taf.js';
import { vmcImc } from '../core/suitability.js';
import type { SuitabilityMinima } from '../core/suitability.js';
import { HudRenderer } from '../hud/renderer.js';
import { VIEW_ORDER } from '../hud/model.js';
import type { HudView, HudState, HudConfig } from '../hud/model.js';

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
        this.cycleView(1);
        break;
      case 'swipeUp':
        this.cycleView(-1);
        break;
      case 'press':
        this.onPress();
        break;
      case 'doublePress':
        this.config.clock = this.config.clock === 'utc' ? 'local' : 'utc';
        break;
    }
    this.draw();
  }

  private divertDetail = false;
  private criticalPhase = false;

  /**
   * Below 1500 ft the HUD declutters to GS only (critical phase — eyes outside).
   * Hysteresis (enter <1500, exit >1700) so GPS-altitude noise can't flicker it.
   * Uses GPS geometric altitude — a proxy for height; good near sea-level fields.
   */
  private updateCriticalPhase(): void {
    const h = this.position?.altitudeM != null ? metersToFeet(this.position.altitudeM) : null;
    if (h == null) return; // no height info — hold the last state
    if (h < 1500) this.criticalPhase = true;
    else if (h > 1700) this.criticalPhase = false;
  }

  private onPress(): void {
    if (this.view === 'CRUISE') {
      this.plan.next();
    } else if (this.view === 'DIVERT') {
      this.divertDetail = !this.divertDetail; // show/hide the best field's reasons
    } else if (this.view === 'SETTINGS') {
      this.config.autoSequence = !this.config.autoSequence;
    }
  }

  private cycleView(dir: 1 | -1): void {
    const i = VIEW_ORDER.indexOf(this.view);
    const n = VIEW_ORDER.length;
    this.view = VIEW_ORDER[(i + dir + n) % n]!;
  }

  // --- output ---

  private draw(): void {
    this.updateCriticalPhase();
    // Critical phase overrides page selection — always the decluttered CRUISE.
    const view = this.criticalPhase ? 'CRUISE' : this.view;
    this.renderer.render(view, this.snapshot());
  }

  private snapshot(): HudState {
    const now = new Date(this.now());
    const guidance = this.position ? this.plan.guidance(this.position) : null;
    const { alternates, briefingAgeSec } = this.computeDiversion(now);
    const best = alternates?.find((a) => a.best) ?? alternates?.[0];
    const report = this.briefing && best ? this.briefing.report(best.waypoint.ident, now, this.diversion.reasons) : null;
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
      divertDetail: this.divertDetail,
      bestReport: best && report ? { ident: best.waypoint.ident, report } : null,
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
