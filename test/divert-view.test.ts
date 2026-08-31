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
    cruiseFull: true,
    gpsStale: false,
    focus: 'page',
    divertSelection: 0,
    settingsSelection: 0,
    selectedWx: null,
    destWx: null,
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

describe('CRUISE view — hold-to-reveal declutter', () => {
  const pos = { lat: 25, lon: 55, speedMps: 100, trackDeg: 90, altitudeM: 300, timestamp: 0 };

  it('shows GS only when not revealed (the default minimal strip)', () => {
    const c = buildView('CRUISE', baseState({ position: pos, cruiseFull: false }));
    expect(c).toHaveLength(1);
    expect(c[0]!.text).toMatch(/^GS /);
  });

  it('shows the full strip when revealed', () => {
    const c = buildView('CRUISE', baseState({ position: pos, cruiseFull: true }));
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
    expect(c[0]!.text).toMatch(/0 ALTN/);
    expect(c[1]!.text).toMatch(/no suitable A320 field/);
  });

  it('lists fields with runway in use, VMC/IMC and track-relative bearing (page level, no cursor)', () => {
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
    expect(c[0]!.text).toMatch(/2 ALTN/);
    expect(c[0]!.text).toMatch(/PACK 12m/);
    expect(c[0]!.text).toContain('2TAP=WX'); // two taps open the weather browser
    expect(c[1]!.text).toContain('OMDB');
    expect(c[1]!.text).not.toContain('>'); // the 4-up is always cursor-less
    expect(c[1]!.text).toContain('R030');
    expect(c[1]!.text).toContain('RW30');
    expect(c[1]!.text.trim().endsWith('V')).toBe(true);
    expect(c[2]!.text).toContain('L075');
    expect(c[2]!.text).toContain('RW26');
    expect(c[2]!.text.trim().endsWith('I')).toBe(true);
  });

  it('opens the selected field raw METAR/TAF in the weather browser, with N/M and a back hint', () => {
    const report = { verdict: 'GO' as const, checks: [], reasons: [] };
    const alternates: Alternate[] = [
      alt({ waypoint: { ident: 'OMDB', lat: 25.25, lon: 55.36 } }),
      alt({ waypoint: { ident: 'OOMS', lat: 23.6, lon: 58.3 } }),
    ];
    const c = buildView(
      'DIVERT',
      baseState({
        alternates,
        briefingAgeSec: 60,
        focus: 'detail',
        divertSelection: 0,
        selectedWx: {
          ident: 'OMDB',
          report,
          metarRaw: 'OMDB 231600Z 30012KT CAVOK 38/12 Q0998 NOSIG',
          tafRaw: 'TAF OMDB 231100Z 2312/2418 31012KT CAVOK',
        },
      }),
    );
    expect(c[0]!.text).toMatch(/^OMDB 1\/2/); // ident + position in the browser
    expect(c[0]!.text).toContain('GO');
    expect(c[0]!.text).toContain('2TAP=BACK');
    expect(c.some((x) => x.text.includes('30012KT CAVOK'))).toBe(true); // raw METAR
    expect(c.some((x) => x.text.includes('2312/2418'))).toBe(true); // raw TAF
  });

  it('shows the 4 most suitable (1 header + 4 rows)', () => {
    const alternates = Array.from({ length: 10 }, (_, i) =>
      alt({ waypoint: { ident: `OM${i}${i}`, lat: 25, lon: 55 }, distanceNm: 100 + i }),
    );
    const c = buildView('DIVERT', baseState({ alternates, briefingAgeSec: 60 }));
    expect(c).toHaveLength(5); // 1 header + 4 rows
  });
});
