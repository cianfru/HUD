import { describe, it, expect } from 'vitest';
import {
  distanceNm,
  initialBearingDeg,
  crossTrackNm,
  alongTrackNm,
  destinationPoint,
  normalizeDeg,
  angleDiffDeg,
  EARTH_RADIUS_NM,
} from '../src/core/geo.js';

const QUARTER_NM = (Math.PI / 2) * EARTH_RADIUS_NM; // 90° of great circle
const ONE_DEG_NM = (Math.PI / 180) * EARTH_RADIUS_NM; // ~60.04 nm

const near = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThan(tol);

describe('normalizeDeg / angleDiffDeg', () => {
  it('wraps into [0,360)', () => {
    expect(normalizeDeg(370)).toBeCloseTo(10);
    expect(normalizeDeg(-10)).toBeCloseTo(350);
    expect(normalizeDeg(360)).toBeCloseTo(0);
  });
  it('signed difference is clockwise-positive and wraps at ±180', () => {
    expect(angleDiffDeg(10, 350)).toBeCloseTo(20); // 10 is CW of 350
    expect(angleDiffDeg(350, 10)).toBeCloseTo(-20);
    expect(angleDiffDeg(90, 0)).toBeCloseTo(90);
  });
});

describe('distanceNm', () => {
  it('one degree of latitude is ~60 nm', () => {
    near(distanceNm({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }), ONE_DEG_NM, 0.01);
  });
  it('quarter great-circle along the equator', () => {
    near(distanceNm({ lat: 0, lon: 0 }, { lat: 0, lon: 90 }), QUARTER_NM, 0.01);
  });
  it('is symmetric', () => {
    const a = { lat: 25.25, lon: 51.56 }; // Doha-ish
    const b = { lat: 25.25, lon: 55.36 }; // Dubai-ish
    near(distanceNm(a, b), distanceNm(b, a), 1e-9);
  });
});

describe('initialBearingDeg', () => {
  it('cardinal directions from the equator/prime meridian', () => {
    expect(initialBearingDeg({ lat: 0, lon: 0 }, { lat: 0, lon: 10 })).toBeCloseTo(90); // E
    expect(initialBearingDeg({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(0); // N
    expect(initialBearingDeg({ lat: 0, lon: 0 }, { lat: -1, lon: 0 })).toBeCloseTo(180); // S
    expect(initialBearingDeg({ lat: 0, lon: 0 }, { lat: 0, lon: -10 })).toBeCloseTo(270); // W
  });
});

describe('crossTrackNm', () => {
  const start = { lat: 0, lon: 0 };
  const end = { lat: 0, lon: 10 }; // eastbound along equator
  it('is ~0 for a point on the track', () => {
    near(crossTrackNm({ lat: 0, lon: 5 }, start, end), 0, 0.01);
  });
  it('is negative (left of course) north of an eastbound leg', () => {
    const xtk = crossTrackNm({ lat: 1, lon: 5 }, start, end);
    expect(xtk).toBeLessThan(0);
    near(Math.abs(xtk), ONE_DEG_NM, 0.05);
  });
  it('is positive (right of course) south of an eastbound leg', () => {
    expect(crossTrackNm({ lat: -1, lon: 5 }, start, end)).toBeGreaterThan(0);
  });
});

describe('alongTrackNm', () => {
  const start = { lat: 0, lon: 0 };
  const end = { lat: 0, lon: 10 };
  it('measures progress from the start along the leg', () => {
    near(alongTrackNm({ lat: 0.001, lon: 5 }, start, end), 5 * ONE_DEG_NM, 0.1);
  });
  it('is negative behind the start', () => {
    expect(alongTrackNm({ lat: 0.001, lon: -2 }, start, end)).toBeLessThan(0);
  });
});

describe('destinationPoint', () => {
  it('inverts distance+bearing back to the target point', () => {
    const to = destinationPoint({ lat: 0, lon: 0 }, 90, QUARTER_NM);
    near(to.lat, 0, 1e-6);
    near(to.lon, 90, 1e-6);
  });
  it('round-trips with distanceNm/initialBearingDeg', () => {
    const from = { lat: 25.27, lon: 51.61 };
    const to = { lat: 51.15, lon: -0.19 };
    const brg = initialBearingDeg(from, to);
    const dist = distanceNm(from, to);
    const back = destinationPoint(from, brg, dist);
    near(back.lat, to.lat, 0.01);
    near(back.lon, to.lon, 0.01);
  });
});
