/**
 * Real position source backed by the Even Hub SDK location API.
 *
 * On an iPhone with a Garmin GLO paired as an MFi location provider, iOS serves
 * the GLO's fixes (up to ~10 Hz, WAAS/SBAS-augmented) through the same location
 * service the SDK exposes here, so no GLO-specific code is required — it "just
 * works" as the system location source.
 *
 * NOTE: inside an aluminium airframe GPS reception is poor; the GLO needs a
 * window / glareshield placement to hold a fix. See README limitations.
 */
import { AppLocationAccuracy } from '@evenrealities/even_hub_sdk';
import type { EvenAppBridge, AppLocation } from '@evenrealities/even_hub_sdk';
import type { Position } from '../../core/types.js';
import type { PositionSource, PositionListener } from './source.js';

/** Re-arm the GLO/iOS feed if it goes this long without a fix. */
const STALE_MS = 6000;
/** Don't re-arm more often than this (a fresh subscribe needs time to deliver). */
const REARM_COOLDOWN_MS = 8000;
/** How often the watchdog checks for a stalled feed. */
const WATCHDOG_MS = 3000;

export class SdkPositionSource implements PositionSource {
  private unsubscribe: (() => void) | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private onFix: PositionListener | null = null;
  private lastFixMs = 0;
  private lastRearmMs = 0;

  constructor(private readonly bridge: EvenAppBridge) {}

  start(onFix: PositionListener): void {
    this.onFix = onFix;
    this.subscribe();
    this.arm();
    // Watchdog: the GLO feed reaches us through iOS CoreLocation and the BLE
    // bridge, either of which can stall (backgrounding, a BLE hiccup, GPS loss
    // in the airframe). If fixes stop arriving we re-subscribe and re-arm the
    // updates so the feed recovers on its own, instead of freezing on the last
    // fix until the app is restarted.
    this.watchdog = setInterval(() => this.check(), WATCHDOG_MS);
  }

  stop(): void {
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.onFix = null;
    void this.bridge.stopAppLocationUpdates();
  }

  /** Wall-clock ms since the last fix (Infinity if none yet) — for a HUD age readout. */
  msSinceFix(): number {
    return this.lastFixMs ? Date.now() - this.lastFixMs : Infinity;
  }

  private subscribe(): void {
    this.unsubscribe?.();
    this.unsubscribe = this.bridge.onAppLocationChanged((loc) => {
      this.lastFixMs = Date.now();
      this.onFix?.(toPosition(loc));
    });
  }

  private arm(): void {
    // High accuracy, tight update cadence — the GLO can supply it.
    void this.bridge.startAppLocationUpdates({
      accuracy: AppLocationAccuracy.High,
      intervalMs: 1000,
    });
    this.lastRearmMs = Date.now();
  }

  private check(): void {
    const now = Date.now();
    const noFixFor = this.lastFixMs ? now - this.lastFixMs : now - this.lastRearmMs;
    if (noFixFor > STALE_MS && now - this.lastRearmMs > REARM_COOLDOWN_MS) {
      this.subscribe();
      this.arm();
    }
  }
}

/** Convert an SDK AppLocation (deg, m, m/s) into our internal Position. */
export function toPosition(loc: AppLocation): Position {
  return {
    lat: loc.latitude,
    lon: loc.longitude,
    altitudeM: loc.altitude,
    speedMps: loc.speed,
    trackDeg: loc.heading,
    accuracyM: loc.accuracy,
    timestamp: loc.timestamp ?? Date.now(),
  };
}
