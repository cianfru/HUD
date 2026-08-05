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

export class SdkPositionSource implements PositionSource {
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly bridge: EvenAppBridge) {}

  start(onFix: PositionListener): void {
    this.unsubscribe = this.bridge.onAppLocationChanged((loc) => {
      onFix(toPosition(loc));
    });
    // High accuracy, tight update cadence — the GLO can supply it.
    void this.bridge.startAppLocationUpdates({
      accuracy: AppLocationAccuracy.High,
      intervalMs: 1000,
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    void this.bridge.stopAppLocationUpdates();
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
