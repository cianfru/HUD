import { describe, it, expect } from 'vitest';
import { evaluateSuitability, crosswindKt } from '../src/core/suitability.js';
import type { SuitabilityFacts } from '../src/core/suitability.js';

const base: SuitabilityFacts = {
  longestRwyFt: 13000,
  hardSurface: true,
  runwayHeadingsDeg: [120, 300],
  ceilingFt: undefined,
  visM: 9999,
  windDirDeg: 300,
  windKt: 10,
  withinValidity: true,
  hasForecast: true,
  dataAgeSec: 600,
};
const get = (r: ReturnType<typeof evaluateSuitability>, key: string) =>
  r.checks.find((c) => c.key === key)!;

describe('crosswindKt', () => {
  it('is zero straight down the runway, full for a 90-degree wind', () => {
    expect(crosswindKt(120, 20, [120, 300])!.xwKt).toBeCloseTo(0, 5);
    expect(crosswindKt(210, 20, [120, 300])!.xwKt).toBeCloseTo(20, 5);
  });
  it('picks the runway with the least crosswind', () => {
    // Wind 150: rwy 120 -> 30deg (xw=10), rwy 300 -> 150deg (xw=10). ~equal.
    const r = crosswindKt(160, 20, [120, 300])!;
    expect(r.xwKt).toBeLessThan(20);
  });
  it('is null for variable wind or no runway headings', () => {
    expect(crosswindKt('VRB', 20, [120])).toBeNull();
    expect(crosswindKt(120, 20, undefined)).toBeNull();
  });
});

describe('evaluateSuitability', () => {
  it('is GO when everything passes', () => {
    const r = evaluateSuitability(base);
    expect(r.verdict).toBe('GO');
    expect(r.reasons).toEqual([]);
    expect(get(r, 'runway').status).toBe('pass');
  });

  it('is NOGO on a hard fail (runway too short) with a reason', () => {
    const r = evaluateSuitability({ ...base, longestRwyFt: 4000 });
    expect(r.verdict).toBe('NOGO');
    expect(get(r, 'runway').status).toBe('fail');
    expect(r.reasons.join(' ')).toMatch(/RWY/);
  });

  it('is NOGO below the ceiling minimum', () => {
    const r = evaluateSuitability({ ...base, ceilingFt: 400 });
    expect(r.verdict).toBe('NOGO');
    expect(get(r, 'ceiling').status).toBe('fail');
  });

  it('is NOGO below the visibility minimum', () => {
    const r = evaluateSuitability({ ...base, visM: 2000 });
    expect(r.verdict).toBe('NOGO');
    expect(get(r, 'visibility').status).toBe('fail');
  });

  it('is NOGO outside the forecast validity window', () => {
    const r = evaluateSuitability({ ...base, withinValidity: false });
    expect(r.verdict).toBe('NOGO');
  });

  it('is CAUTION when crosswind exceeds the max but all hard checks pass', () => {
    // Wind 210/45 across a 120/300 runway -> ~45 kt crosswind.
    const r = evaluateSuitability({ ...base, windDirDeg: 210, windKt: 45 });
    expect(get(r, 'crosswind').status).toBe('fail');
    expect(r.verdict).toBe('CAUTION');
  });

  it('is CAUTION when the pack is stale', () => {
    const r = evaluateSuitability({ ...base, dataAgeSec: 10 * 3600 });
    expect(get(r, 'dataAge').status).toBe('fail');
    expect(r.verdict).toBe('CAUTION');
  });

  it('is UNKNOWN when there is no forecast (weather cannot be judged)', () => {
    const r = evaluateSuitability({ ...base, hasForecast: false, visM: undefined });
    expect(r.verdict).toBe('UNKNOWN');
    expect(get(r, 'ceiling').status).toBe('unknown');
  });

  it('is UNKNOWN with no runway data', () => {
    const r = evaluateSuitability({ ...base, longestRwyFt: undefined });
    expect(get(r, 'runway').status).toBe('unknown');
    expect(r.verdict).toBe('UNKNOWN');
  });

  it('uses gusts for a conservative crosswind', () => {
    const r = evaluateSuitability({ ...base, windDirDeg: 210, windKt: 20, gustKt: 45 });
    expect(get(r, 'crosswind').status).toBe('fail'); // gust drives it over
  });

  it('a hard fail outranks an advisory fail in the verdict', () => {
    const r = evaluateSuitability({ ...base, longestRwyFt: 4000, dataAgeSec: 10 * 3600 });
    expect(r.verdict).toBe('NOGO');
  });
});
