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
  ...over,
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
    expect(c[0]!.text).toMatch(/0 A320 FIELDS/);
    expect(c[1]!.text).toMatch(/no suitable A320 field/);
  });

  it('lists fields with best marker, GO/WX, and track-relative bearing', () => {
    const alternates: Alternate[] = [
      alt({ waypoint: { ident: 'OMDB', lat: 25.25, lon: 55.36 }, relBearingDeg: 30, best: true }),
      alt({
        waypoint: { ident: 'OOMS', lat: 23.6, lon: 58.3 },
        relBearingDeg: -75,
        distanceNm: 360,
        suitable: false,
      }),
    ];
    const c = buildView('DIVERT', baseState({ alternates, briefingAgeSec: 720 }));
    expect(c[0]!.text).toMatch(/2 A320 FIELDS/);
    expect(c[0]!.text).toMatch(/PACK 12m/);
    expect(c[1]!.text).toContain('*OMDB');
    expect(c[1]!.text).toContain('R030');
    expect(c[1]!.text.trim().endsWith('GO')).toBe(true);
    expect(c[2]!.text).toContain('L075');
    expect(c[2]!.text.trim().endsWith('WX')).toBe(true);
  });

  it('caps the list at 6 rows to respect the 8-text-container firmware limit', () => {
    const alternates = Array.from({ length: 10 }, (_, i) =>
      alt({ waypoint: { ident: `OM${i}${i}`, lat: 25, lon: 55 }, distanceNm: 100 + i }),
    );
    const c = buildView('DIVERT', baseState({ alternates, briefingAgeSec: 60 }));
    expect(c).toHaveLength(7); // 1 header + 6 rows
  });
});
