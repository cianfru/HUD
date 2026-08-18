import { describe, it, expect } from 'vitest';
import { BriefingStore } from '../src/data/briefing.js';
import type { BriefingPack } from '../src/data/briefing.js';
import { computeAlternates } from '../src/core/diversion.js';

// Pack captured on the ground; TAF day tokens resolve against createdAt.
const CREATED = '2026-08-05T17:00:00.000Z';

const pack: BriefingPack = {
  version: 1,
  createdAt: CREATED,
  route: 'OMDB OOMS OERK',
  airports: [
    // A320-capable: long hard runway. Runways 12/30 -> headings ~121/301.
    { ident: 'OMDB', name: 'Dubai Intl', lat: 25.2528, lon: 55.3644, elevFt: 62, longestRwyFt: 13124, hardSurface: true, runwayHeadingsDeg: [121, 301] },
    // A320-capable, ~340 nm ENE of Dubai.
    { ident: 'OOMS', name: 'Muscat Intl', lat: 23.5933, lon: 58.2844, elevFt: 48, longestRwyFt: 13123, hardSurface: true, runwayHeadingsDeg: [83, 263] },
    // Too short for an A320 (grass strip, ~1200 ft).
    { ident: 'OKBK', name: 'Tiny Field', lat: 24.0, lon: 56.0, elevFt: 30, longestRwyFt: 1200, hardSurface: false },
    // No runway data at all -> not capable.
    { ident: 'OERK', name: 'Unknown Rwy', lat: 24.9576, lon: 46.6988, elevFt: 2049 },
  ],
  weather: [
    { ident: 'OMDB', tafRaw: 'TAF OMDB 051700Z 0518/0624 28012KT CAVOK FM060600 14015G25KT 3000 DU BKN008' },
    { ident: 'OOMS', tafRaw: 'TAF OOMS 051700Z 0518/0624 33008KT 9999 SCT040' },
    { ident: 'OKBK', tafRaw: 'TAF OKBK 051700Z 0518/0624 00000KT 2SM BR OVC004' },
    // OERK: no TAF in the pack.
  ],
};

const at = (d: number, h: number) => new Date(Date.UTC(2026, 7, d, h, 0, 0));

describe('BriefingStore — A320 capability', () => {
  const store = new BriefingStore(pack);

  it('accepts a long hard runway', () => {
    expect(store.a320Capable('OMDB')).toBe(true);
    expect(store.a320Capable('OOMS')).toBe(true);
  });

  it('rejects a short strip', () => {
    expect(store.a320Capable('OKBK')).toBe(false);
  });

  it('rejects a field with no runway data', () => {
    expect(store.a320Capable('OERK')).toBe(false);
  });

  it('honours a stricter minimum runway length', () => {
    // 13124 ft ~= 4000 m; require 4200 m and Dubai drops out.
    expect(store.a320Capable('OMDB', 4200)).toBe(false);
  });
});

describe('BriefingStore — suitability at time', () => {
  const store = new BriefingStore(pack);

  it('reads the cached TAF and evaluates it at the given time', () => {
    expect(store.assess('OMDB', at(5, 20))?.category).toBe('VFR');
    const after = store.assess('OMDB', at(6, 8));
    expect(after?.category).toBe('IFR'); // after the FM group
    expect(after?.suitable).toBe(true);
  });

  it('marks a LIFR field as not suitable', () => {
    const a = store.assess('OKBK', at(5, 20));
    expect(a?.category).toBe('LIFR');
    expect(a?.suitable).toBe(false);
  });

  it('returns null when no TAF is cached', () => {
    expect(store.assess('OERK', at(5, 20))).toBeNull();
  });
});

describe('BriefingStore — nearby', () => {
  const store = new BriefingStore(pack);

  it('lists only A320-capable fields within range, nearest first, with bearing', () => {
    const near = store.nearby({ lat: 25.2528, lon: 55.3644 }, 1000);
    expect(near.map((n) => n.airport.ident)).toEqual(['OMDB', 'OOMS']);
    expect(near[0]!.distanceNm).toBeCloseTo(0, 0);
    // Muscat is roughly east-south-east of Dubai.
    expect(near[1]!.bearingDeg).toBeGreaterThan(90);
    expect(near[1]!.bearingDeg).toBeLessThan(150);
  });

  it('excludes fields beyond maxNm', () => {
    const near = store.nearby({ lat: 25.2528, lon: 55.3644 }, 100);
    expect(near.map((n) => n.airport.ident)).toEqual(['OMDB']);
  });
});

describe('BriefingStore — transparent suitability report', () => {
  const store = new BriefingStore(pack);

  it('returns a GO verdict with passing checks for a good field', () => {
    const r = store.report('OMDB', at(5, 20))!;
    expect(r.verdict).toBe('GO');
    expect(r.checks.find((c) => c.key === 'runway')!.status).toBe('pass');
    expect(r.checks.find((c) => c.key === 'crosswind')!.status).toBe('pass');
  });

  it('turns the FM ceiling drop into a NOGO with a stated reason', () => {
    // OMDB after 06:06Z: vis 3000 m + BKN008 (800 ft) -> below ceiling minimum.
    const r = store.report('OMDB', at(6, 8))!;
    expect(r.verdict).toBe('NOGO');
    expect(r.reasons.join(' ')).toMatch(/CIG/);
  });

  it('reports UNKNOWN weather when no TAF is cached (runway still checked)', () => {
    const r = store.report('OERK', at(5, 20))!;
    expect(r.checks.find((c) => c.key === 'ceiling')!.status).toBe('unknown');
    expect(r.verdict).toBe('UNKNOWN');
  });

  it('is null for a field not in the pack', () => {
    expect(store.report('ZZZZ', at(5, 20))).toBeNull();
  });
});

describe('BriefingStore — offline diversion candidates', () => {
  const store = new BriefingStore(pack);

  it('feeds computeAlternates with TAF-driven suitability', () => {
    // At 06:08Z Dubai has gone IFR (still suitable); Muscat is VFR.
    const cands = store.candidatesAt(at(6, 8));
    // Only A320-capable fields with a TAF -> OMDB and OOMS (OKBK too short, OERK no rwy).
    expect(cands.map((c) => c.waypoint.ident).sort()).toEqual(['OMDB', 'OOMS']);
    expect(cands.every((c) => c.suitable)).toBe(true);

    const alts = computeAlternates({ lat: 25.2528, lon: 55.3644 }, 90, 450, cands, {
      maxRangeNm: 1000,
    });
    expect(alts[0]!.waypoint.ident).toBe('OMDB'); // nearest suitable
    expect(alts.find((a) => a.best)?.waypoint.ident).toBe('OMDB');
  });
});
