import { describe, it, expect } from 'vitest';
import { parseTaf, assessTaf, conditionsAt, flightCategory } from '../src/core/taf.js';

// Reference month/day for resolving the day-of-month tokens.
const REF = new Date(Date.UTC(2026, 7, 5, 17, 0, 0)); // 2026-08-05 17:00Z
const at = (d: number, h: number) => new Date(Date.UTC(2026, 7, d, h, 0, 0));

describe('flightCategory', () => {
  it('maps ceiling/visibility to categories', () => {
    expect(flightCategory({ cavok: true, raw: '' })).toBe('VFR');
    expect(flightCategory({ visM: 10000, raw: '' })).toBe('VFR');
    expect(flightCategory({ ceilingFt: 2000, visM: 10000, raw: '' })).toBe('MVFR');
    expect(flightCategory({ ceilingFt: 800, visM: 10000, raw: '' })).toBe('IFR');
    expect(flightCategory({ ceilingFt: 400, raw: '' })).toBe('LIFR');
    expect(flightCategory({ visM: 3218, raw: '' })).toBe('IFR'); // 2 SM
  });
});

describe('parseTaf header', () => {
  it('parses station and validity', () => {
    const taf = parseTaf(
      'TAF EGLL 051658Z 0518/0624 28012KT 9999 SCT045 TEMPO 0518/0520 28015G25KT BECMG 0618/0621 34005KT',
      REF,
    )!;
    expect(taf.station).toBe('EGLL');
    expect(taf.validFrom.toISOString()).toBe('2026-08-05T18:00:00.000Z');
    expect(taf.validTo.toISOString()).toBe('2026-08-07T00:00:00.000Z'); // 0624 -> day7 00z
    expect(taf.changes.map((c) => c.kind)).toEqual(['TEMPO', 'BECMG']);
  });
});

describe('assessTaf — prevailing over the forecast', () => {
  const egll = parseTaf(
    'TAF EGLL 051658Z 0518/0624 28012KT 9999 SCT045 TEMPO 0518/0520 28015G25KT BECMG 0618/0621 34005KT',
    REF,
  )!;

  it('is VFR/suitable in the base period', () => {
    const a = assessTaf(egll, at(5, 20));
    expect(a.category).toBe('VFR');
    expect(a.suitable).toBe(true);
    expect(a.withinValidity).toBe(true);
  });

  it('applies a BECMG wind change without altering the (good) category', () => {
    const cond = conditionsAt(egll, at(6, 22)).prevailing;
    expect(cond.windDirDeg).toBe(340); // BECMG 34005KT is now prevailing
    expect(flightCategory(cond)).toBe('VFR');
  });

  it('flags times outside the validity window as not suitable', () => {
    const a = assessTaf(egll, at(8, 0)); // past validTo (day7 00z)
    expect(a.withinValidity).toBe(false);
    expect(a.suitable).toBe(false);
  });
});

describe('assessTaf — FM change to IFR', () => {
  const taf = parseTaf(
    'TAF OMDB 051700Z 0518/0624 28012KT CAVOK FM060600 14015G25KT 3000 DU BKN008',
    REF,
  )!;

  it('is VFR before the FM, IFR after it', () => {
    expect(assessTaf(taf, at(5, 20)).category).toBe('VFR');
    const after = assessTaf(taf, at(6, 8));
    expect(after.category).toBe('IFR'); // vis 3000 m + ceiling 800 ft
    expect(after.suitable).toBe(true); // IFR still acceptable by default minima
  });
});

describe('assessTaf — LIFR is not suitable', () => {
  it('rejects a low-ceiling forecast', () => {
    const taf = parseTaf('TAF KXYZ 051700Z 0518/0624 18010KT 2SM BR OVC004', REF)!;
    const a = assessTaf(taf, at(5, 20));
    expect(a.category).toBe('LIFR'); // ceiling 400 ft
    expect(a.suitable).toBe(false);
  });
});

describe('assessTaf — TEMPO worse than prevailing is surfaced', () => {
  it('keeps prevailing but reports the tempo category', () => {
    const taf = parseTaf(
      'TAF KABC 051700Z 0518/0624 30010KT 9999 SCT040 TEMPO 0519/0522 3000 BR OVC006',
      REF,
    )!;
    const a = assessTaf(taf, at(5, 20));
    expect(a.category).toBe('VFR'); // prevailing
    expect(a.tempoCategory).toBe('IFR'); // TEMPO 3000m/OVC006 is worse
    expect(a.suitable).toBe(true);
  });
});
