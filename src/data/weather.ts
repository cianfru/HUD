/**
 * Weather module (the doc's second domain module): live METAR / TAF / D-ATIS,
 * cached per airport with freshness, plus a first-cut suitability call.
 *
 * Data comes through same-origin edge proxies (`/api/wx`, `/api/atis`) because
 * the upstream NOAA API sends no CORS header. Suitability here is a placeholder
 * minima keyed on the reported flight category — NOT operational go/no-go.
 */
export type FltCat = 'VFR' | 'MVFR' | 'IFR' | 'LIFR' | 'UNKN';

export interface WeatherReport {
  ident: string;
  fltCat: FltCat;
  metarRaw: string | null;
  tafRaw: string | null;
  observedSec: number | null;
  fetchedMs: number;
}

/** Placeholder minima: everything except LIFR is treated as usable (unknown = assume ok). */
export function suitableFromCat(cat: FltCat): boolean {
  return cat !== 'LIFR';
}

const STALE_MS = 10 * 60 * 1000;

interface MetarItem {
  icaoId?: string;
  fltCat?: string;
  rawOb?: string;
  obsTime?: number;
}
interface TafItem {
  icaoId?: string;
  rawTAF?: string;
}

export class WeatherStore {
  private cache = new Map<string, WeatherReport>();
  private pending = new Set<string>();
  private atisCache = new Map<string, { atis: string | null; ms: number }>();

  constructor(
    private readonly base = '',
    private readonly now: () => number = () => Date.now(),
    private readonly doFetch: typeof fetch = (...a) => fetch(...a),
  ) {}

  get(ident: string): WeatherReport | undefined {
    return this.cache.get(ident);
  }

  /** Suitability from cached weather; unknown fields default to suitable. */
  suitability(ident: string): boolean {
    const r = this.cache.get(ident);
    return r ? suitableFromCat(r.fltCat) : true;
  }

  ageSec(ident: string): number | null {
    const r = this.cache.get(ident);
    if (!r || r.observedSec == null) return null;
    return Math.max(0, Math.round(this.now() / 1000 - r.observedSec));
  }

  /** Fetch weather for any of `idents` that are missing or stale (batched). */
  async ensure(idents: string[]): Promise<void> {
    const need = idents.filter((id) => {
      if (this.pending.has(id)) return false;
      const r = this.cache.get(id);
      return !r || this.now() - r.fetchedMs > STALE_MS;
    });
    if (need.length === 0) return;
    need.forEach((id) => this.pending.add(id));
    try {
      const res = await this.doFetch(`${this.base}/api/wx?ids=${need.join(',')}`);
      if (!res.ok) return;
      const data = (await res.json()) as { metars?: MetarItem[]; tafs?: TafItem[] };
      const tafByIcao = new Map((data.tafs ?? []).map((t) => [t.icaoId, t.rawTAF ?? null]));
      const seen = new Set<string>();
      for (const m of data.metars ?? []) {
        if (!m.icaoId) continue;
        seen.add(m.icaoId);
        this.cache.set(m.icaoId, {
          ident: m.icaoId,
          fltCat: normalizeCat(m.fltCat),
          metarRaw: m.rawOb ?? null,
          tafRaw: tafByIcao.get(m.icaoId) ?? null,
          observedSec: m.obsTime ?? null,
          fetchedMs: this.now(),
        });
      }
      // Remember idents with no data so we don't hammer them.
      for (const id of need) {
        if (!seen.has(id) && !this.cache.has(id)) {
          this.cache.set(id, {
            ident: id,
            fltCat: 'UNKN',
            metarRaw: null,
            tafRaw: null,
            observedSec: null,
            fetchedMs: this.now(),
          });
        }
      }
    } catch {
      /* offline / no proxy — leave cache as-is */
    } finally {
      need.forEach((id) => this.pending.delete(id));
    }
  }

  /** D-ATIS text for a field (US only), cached ~2 min; null where unavailable. */
  async ensureAtis(ident: string): Promise<string | null> {
    const hit = this.atisCache.get(ident);
    if (hit && this.now() - hit.ms < 120_000) return hit.atis;
    try {
      const res = await this.doFetch(`${this.base}/api/atis?id=${ident}`);
      const data = (await res.json()) as { atis?: string | null };
      const atis = data.atis ?? null;
      this.atisCache.set(ident, { atis, ms: this.now() });
      return atis;
    } catch {
      return null;
    }
  }
}

function normalizeCat(raw: string | undefined): FltCat {
  const c = (raw || '').toUpperCase();
  return c === 'VFR' || c === 'MVFR' || c === 'IFR' || c === 'LIFR' ? c : 'UNKN';
}
