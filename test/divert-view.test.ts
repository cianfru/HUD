import { describe, it, expect } from 'vitest';
import { buildView } from '../src/hud/views.js';
import type { HudState } from '../src/hud/model.js';
import type { Alternate } from '../src/core/diversion.js';
import { FlightPlan } from '../src/core/flightplan.js';

function baseState(over: Partial<HudState>): HudState {
  return {
    now: new Date(Date.UTC(2026, 7, 5, 18, 0, 0)),
    position: { lat: 25, lon: 52, timestamp: 0 },
    guidance: null,
    plan: new FlightPlan([]),
    device: { connected: true },
    config: { clock: 'utc', autoSequence: true },
    flightStartMs: 0,
    alternates: null,
    briefingAgeSec: null,
    closestAlternate: null,
    criticalPhase: false,
    divertDetail: false,
    bestReport: null,
    ...over,
  };
}

const alt = (over: Partial<Alternate>): Alternate => ({
  waypoint: { ident: 'OMDB', lat: 25.25, lon: 55.36, kind: 'airport' },
  bearingDeg: 100,
  relBearingDeg: 30,
  distanceNm: 180,
  eteSec: 1440,
  suitable: true,
  best: false,
  runway: '30',
  wx: 'V',
  ...over,
});

describe('CRUISE view — critical phase', () => {
  const pos = { lat: 25, lon: 55, speedMps: 100, trackDeg: 90, altitudeM: 300, timestamp: 0 };

  it('declutters to GS only below 1500 ft', () => {
    const c = buildView('CRUISE', baseState({ position: pos, criticalPhase: true }));
    expect(c).toHaveLength(1);
    expect(c[0]!.text).toMatch(/^GS /);
  });

  it('shows the full page when not in critical phase', () => {
    const c = buildView('CRUISE', baseState({ position: pos, criticalPhase: false }));
    expect(c.length).toBeGreaterThan(1);
  });
});

describe('DIVERT view', () => {
  it('says so when no pack is loaded', () => {
    const c = buildView('DIVERT', baseState({ alternates: null, briefingAgeSec: null }));
    expect(c).toHaveLength(1);
    expect(c[0]!.text).toMatch(/NO BRIEFING PACK/);
  });

  it('waits for a fix when a pack is loaded but no alternates computed', () => {
    const c = buildView('DIVERT', baseState({ alternates: null, briefingAgeSec: 600 }));
    expect(c[0]!.text).toMatch(/waiting for GPS/);
  });

  it('reports an empty in-range result', () => {
    const c = buildView('DIVERT', baseState({ alternates: [], briefingAgeSec: 600 }));
    expect(c[0]!.text).toMatch(/0 ENROUTE ALTN/);
    expect(c[1]!.text).toMatch(/no suitable A320 field/);
  });

  it('lists fields with best marker, runway in use, VMC/IMC and track-relative bearing', () => {
    const alternates: Alternate[] = [
      alt({ waypoint: { ident: 'OMDB', lat: 25.25, lon: 55.36 }, relBearingDeg: 30, best: true, runway: '30', wx: 'V' }),
      alt({
        waypoint: { ident: 'OOMS', lat: 23.6, lon: 58.3 },
        relBearingDeg: -75,
        distanceNm: 360,
        runway: '26',
        wx: 'I',
      }),
    ];
    const c = buildView('DIVERT', baseState({ alternates, briefingAgeSec: 720 }));
    expect(c[0]!.text).toMatch(/2 ENROUTE ALTN/);
    expect(c[0]!.text).toMatch(/PACK 12m/);
    expect(c[1]!.text).toContain('*OMDB');
    expect(c[1]!.text).toContain('R030');
    expect(c[1]!.text).toContain('RW30');
    expect(c[1]!.text.trim().endsWith('V')).toBe(true);
    expect(c[2]!.text).toContain('L075');
    expect(c[2]!.text).toContain('RW26');
    expect(c[2]!.text.trim().endsWith('I')).toBe(true);
  });

  it('shows the best field per-check reasons in detail mode', () => {
    const report = {
      verdict: 'NOGO' as const,
      checks: [
        { key: 'runway' as const, label: 'RWY', status: 'pass' as const, severity: 'hard' as const, detail: '13124 ft >= 6562' },
        { key: 'ceiling' as const, label: 'CIG', status: 'fail' as const, severity: 'hard' as const, detail: '800 ft < 1000' },
        { key: 'crosswind' as const, label: 'XW', status: 'pass' as const, severity: 'advisory' as const, detail: '4 kt <= 38 (rwy 30)' },
      ],
      reasons: ['CIG: 800 ft < 1000'],
    };
    const c = buildView(
      'DIVERT',
      baseState({ divertDetail: true, bestReport: { ident: 'OMDB', report } }),
    );
    expect(c[0]!.text).toBe('OMDB   NOGO');
    expect(c[1]!.text).toContain('RWY OK');
    expect(c[2]!.text).toContain('CIG XX');
    expect(c[2]!.text).toContain('800 ft < 1000');
  });

  it('shows the 4 most suitable (1 header + 4 rows)', () => {
    const alternates = Array.from({ length: 10 }, (_, i) =>
      alt({ waypoint: { ident: `OM${i}${i}`, lat: 25, lon: 55 }, distanceNm: 100 + i }),
    );
    const c = buildView('DIVERT', baseState({ alternates, briefingAgeSec: 60 }));
    expect(c).toHaveLength(5); // 1 header + 4 rows
  });
});
