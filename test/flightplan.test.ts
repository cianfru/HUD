import { describe, it, expect } from 'vitest';
import { FlightPlan, legProgress } from '../src/core/flightplan.js';
import { knotsToMps } from '../src/core/units.js';
import { EARTH_RADIUS_NM } from '../src/core/geo.js';
import type { Waypoint, Position } from '../src/core/types.js';

const ONE_DEG_NM = (Math.PI / 180) * EARTH_RADIUS_NM;
const near = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThan(tol);

// Three fixes eastbound along the equator: A(0,0) -> B(0,10) -> C(0,20).
const A: Waypoint = { ident: 'ALPHA', lat: 0, lon: 0 };
const B: Waypoint = { ident: 'BRAVO', lat: 0, lon: 10 };
const C: Waypoint = { ident: 'CHARL', lat: 0, lon: 20 };

function posAt(lat: number, lon: number, gsKt = 480): Position {
  return { lat, lon, speedMps: knotsToMps(gsKt), timestamp: 0 };
}

describe('FlightPlan structure', () => {
  it('defaults the active waypoint to the second fix (first TO leg)', () => {
    const fp = new FlightPlan([A, B, C]);
    expect(fp.activeWaypoint?.ident).toBe('BRAVO');
    expect(fp.legFrom?.ident).toBe('ALPHA');
    expect(fp.destination?.ident).toBe('CHARL');
  });

  it('sequences forward and backward, holding at the destination', () => {
    const fp = new FlightPlan([A, B, C]);
    expect(fp.next()).toBe(true);
    expect(fp.activeWaypoint?.ident).toBe('CHARL');
    expect(fp.next()).toBe(false); // held at destination
    expect(fp.prev()).toBe(true);
    expect(fp.activeWaypoint?.ident).toBe('BRAVO');
    expect(fp.prev()).toBe(false); // held at first leg
  });
});

describe('FlightPlan.guidance', () => {
  it('computes bearing, distance, and destination roll-up on the active leg', () => {
    const fp = new FlightPlan([A, B, C]);
    const g = fp.guidance(posAt(0, 5));
    expect(g.activeWaypoint?.ident).toBe('BRAVO');
    expect(g.bearingToActiveDeg).toBeCloseTo(90, 0); // due east
    near(g.distToActiveNm!, 5 * ONE_DEG_NM, 0.1); // 5° to B
    near(g.xtkNm!, 0, 0.05); // on the leg
    // dest distance = to B (5°) + B->C (10°)
    near(g.distToDestNm!, 15 * ONE_DEG_NM, 0.2);
  });

  it('ETE to the active waypoint matches distance / ground speed', () => {
    const fp = new FlightPlan([A, B, C]);
    const g = fp.guidance(posAt(0, 5, 300)); // 300 kt
    const expectedSec = (g.distToActiveNm! / 300) * 3600;
    near(g.eteToActiveSec!, expectedSec, 1);
  });

  it('reports cross-track sign when off the leg', () => {
    const fp = new FlightPlan([A, B, C]);
    const north = fp.guidance(posAt(1, 5)); // left of eastbound course
    expect(north.xtkNm!).toBeLessThan(0);
    const south = fp.guidance(posAt(-1, 5)); // right of course
    expect(south.xtkNm!).toBeGreaterThan(0);
  });
});

describe('FlightPlan.autoSequence', () => {
  it('advances when within the capture radius of the active waypoint', () => {
    const fp = new FlightPlan([A, B, C]);
    expect(fp.autoSequence(posAt(0, 9.99))).toBe(true); // ~0.6 nm from B
    expect(fp.activeWaypoint?.ident).toBe('CHARL');
  });
  it('does not advance far from the waypoint', () => {
    const fp = new FlightPlan([A, B, C]);
    expect(fp.autoSequence(posAt(0, 5))).toBe(false);
    expect(fp.activeWaypoint?.ident).toBe('BRAVO');
  });
});

describe('legProgress', () => {
  it('is ~0.5 at the midpoint of the active leg', () => {
    const fp = new FlightPlan([A, B, C]);
    near(legProgress(fp, posAt(0, 5))!, 0.5, 0.01);
  });
});
