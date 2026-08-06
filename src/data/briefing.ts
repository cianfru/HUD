/**
 * Offline briefing pack — the whole weather/airfield picture the aircraft needs,
 * captured on the ground so nothing is fetched in the air.
 *
 * A pack is built pre-flight (see scripts/build-briefing.mjs) from the flight's
 * airport set — origin, destination, destination alternates, and the ETOPS
 * en-route alternates (which can be far off-track). In cruise, suitability comes
 * from each field's cached TAF evaluated at the current time (a forecast, valid
 * across the sector), with no connectivity.
 */
import { parseTaf, assessTaf } from '../core/taf.js';
import type { Assessment, Minima } from '../core/taf.js';
import { distanceNm, initialBearingDeg } from '../core/geo.js';
import type { LatLon, Waypoint } from '../core/types.js';

export interface BriefingAirport {
  ident: string;
  name: string;
  lat: number;
  lon: number;
  elevFt?: number;
  /** Longest runway, feet — used for A320-capability filtering. */
  longestRwyFt?: number;
  /** True if any runway is a hard surface (paved). */
  hardSurface?: boolean;
}

export interface BriefingWx {
  ident: string;
  metarRaw?: string;
  metarObsSec?: number;
  tafRaw?: string;
}

export interface BriefingPack {
  version: number;
  /** When the pack was pulled on the ground (ISO). All TAF times resolve against this. */
  createdAt: string;
  route?: string;
  airports: BriefingAirport[];
  weather: BriefingWx[];
}

/** Minimum A320 landing runway (m) — conservative default; tune per weight/wet. */
export const A320_MIN_RWY_M = 2000;
const M_PER_FT = 0.3048;

export class BriefingStore {
  private readonly airports = new Map<string, BriefingAirport>();
  private readonly wx = new Map<string, BriefingWx>();
  private readonly createdAt: Date;

  constructor(pack: BriefingPack) {
    this.createdAt = new Date(pack.createdAt);
    for (const a of pack.airports) this.airports.set(a.ident, a);
    for (const w of pack.weather) this.wx.set(w.ident, w);
  }

  get ageSec(): number {
    return Math.max(0, Math.round((Date.now() - this.createdAt.getTime()) / 1000));
  }

  airport(ident: string): BriefingAirport | undefined {
    return this.airports.get(ident);
  }

  metarRaw(ident: string): string | undefined {
    return this.wx.get(ident)?.metarRaw;
  }

  tafRaw(ident: string): string | undefined {
    return this.wx.get(ident)?.tafRaw;
  }

  /** True if the field's longest hard runway can take an A320. */
  a320Capable(ident: string, minRwyM = A320_MIN_RWY_M): boolean {
    const a = this.airports.get(ident);
    if (!a || a.longestRwyFt == null) return false;
    return a.hardSurface !== false && a.longestRwyFt * M_PER_FT >= minRwyM;
  }

  /** Suitability at time `at` from the cached TAF (forecast). */
  assess(ident: string, at: Date, minima?: Minima): Assessment | null {
    const raw = this.wx.get(ident)?.tafRaw;
    if (!raw) return null;
    const taf = parseTaf(raw, this.createdAt);
    if (!taf) return null;
    return assessTaf(taf, at, minima);
  }

  asWaypoint(ident: string): Waypoint | undefined {
    const a = this.airports.get(ident);
    return a ? { ident: a.ident, name: a.name, lat: a.lat, lon: a.lon, kind: 'airport' } : undefined;
  }

  /** A320-capable fields within `maxNm`, nearest first (with bearing). */
  nearby(
    pos: LatLon,
    maxNm = 1000,
    minRwyM = A320_MIN_RWY_M,
  ): Array<{ airport: BriefingAirport; distanceNm: number; bearingDeg: number }> {
    const out: Array<{ airport: BriefingAirport; distanceNm: number; bearingDeg: number }> = [];
    for (const a of this.airports.values()) {
      if (!this.a320Capable(a.ident, minRwyM)) continue;
      const d = distanceNm(pos, a);
      if (d <= maxNm) out.push({ airport: a, distanceNm: d, bearingDeg: initialBearingDeg(pos, a) });
    }
    out.sort((x, y) => x.distanceNm - y.distanceNm);
    return out;
  }
}
