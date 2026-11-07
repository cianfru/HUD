import { describe, it, expect } from 'vitest';
import { rebaseBriefing, shiftReport } from '../src/data/rebase.js';
import { DEMO_BRIEFING } from '../src/data/briefing-demo.js';
import { BriefingStore } from '../src/data/briefing.js';

const REF = new Date('2026-08-23T05:52:03Z');
const H = 3_600_000;

describe('shiftReport', () => {
  it('shifts obs/issue times, validity, change groups and TX/TN together', () => {
    const taf = 'TAF BIKF 230436Z 2306/2406 20018KT TX12/2314Z TN07/2402Z BECMG 2307/2309 22008KT';
    expect(shiftReport(taf, REF, 30 * H)).toBe(
      'TAF BIKF 241036Z 2412/2512 20018KT TX12/2420Z TN07/2508Z BECMG 2413/2415 22008KT',
    );
  });

  it('crosses a month end and writes an end-of-period midnight as day 24', () => {
    // EGLL TEMPO 2320/2324 shifted by 9 days 4 h -> Sep 1 00Z..04Z; validity end at 2412+...
    const r = shiftReport('TAF EGLL 230456Z 2306/2412 06006KT TEMPO 2320/2324 BKN035', REF, (9 * 24 + 4) * H);
    expect(r).toBe('TAF EGLL 010856Z 0110/0216 06006KT TEMPO 0200/0204 BKN035');
    const end = shiftReport('TAF X 230500Z 2306/2324 00000KT', REF, 0);
    expect(end).toBe('TAF X 230500Z 2306/2324 00000KT');
  });

  it('shifts FM groups and leaves METAR temperatures alone', () => {
    expect(shiftReport('METAR OMDB 230530Z 07005KT CAVOK 40/16 Q1002', REF, 2 * H)).toBe(
      'METAR OMDB 230730Z 07005KT CAVOK 40/16 Q1002',
    );
    expect(shiftReport('TAF X 230500Z 2306/2412 FM231530 10010KT', REF, 24 * H)).toBe(
      'TAF X 240500Z 2406/2512 FM241530 10010KT',
    );
  });
});

describe('rebaseBriefing (demo freshness)', () => {
  it('makes the frozen demo pack fresh and its TAFs valid now', () => {
    const now = new Date('2026-11-07T12:00:00Z');
    const pack = rebaseBriefing(DEMO_BRIEFING, now);
    const ageMin = (now.getTime() - new Date(pack.createdAt).getTime()) / 60_000;
    expect(ageMin).toBeGreaterThanOrEqual(15);
    expect(ageMin).toBeLessThan(75);
    const store = new BriefingStore(pack);
    // OMDB's CAVOK forecast reads GO once its TAF is back in its window
    const omdb = store.report('OMDB', now);
    expect(omdb?.verdict).not.toBe('NOGO');
    expect(store.assess('OMDB', now)?.withinValidity).toBe(true);
  });

  it('does not touch airports, route or idents', () => {
    const pack = rebaseBriefing(DEMO_BRIEFING, new Date('2027-01-01T00:00:00Z'));
    expect(pack.airports).toBe(DEMO_BRIEFING.airports);
    expect(pack.route).toBe(DEMO_BRIEFING.route);
    expect(pack.weather.map((w) => w.ident)).toEqual(DEMO_BRIEFING.weather.map((w) => w.ident));
  });
});
