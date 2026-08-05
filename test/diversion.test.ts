import { describe, it, expect } from 'vitest';
import { computeAlternates } from '../src/core/diversion.js';
import type { AlternateCandidate } from '../src/core/diversion.js';
import type { Waypoint } from '../src/core/types.js';

const wp = (ident: string, lat: number, lon: number): Waypoint => ({ ident, lat, lon, kind: 'airport' });

// Aircraft over the Gulf heading roughly east.
const POS = { lat: 25.27, lon: 54.0 };
const TRACK = 90;
const GS = 450;

const candidates: AlternateCandidate[] = [
  { waypoint: wp('NEAR_OK', 25.27, 54.5), suitable: true }, // ~27 nm east
  { waypoint: wp('FAR_OK', 25.27, 56.0), suitable: true }, // ~108 nm east
  { waypoint: wp('NEAR_BAD', 25.27, 54.3), suitable: false }, // ~16 nm but unsuitable
];

describe('computeAlternates', () => {
  it('ranks suitable-then-nearest and flags exactly one best', () => {
    const alts = computeAlternates(POS, TRACK, GS, candidates);
    expect(alts[0]!.waypoint.ident).toBe('NEAR_OK');
    expect(alts[0]!.best).toBe(true);
    expect(alts.filter((a) => a.best)).toHaveLength(1);
    // Unsuitable ranks last despite being closest.
    expect(alts[alts.length - 1]!.waypoint.ident).toBe('NEAR_BAD');
  });

  it('computes relative bearing against track (east target ~ 0 rel on east track)', () => {
    const alts = computeAlternates(POS, TRACK, GS, candidates);
    const near = alts.find((a) => a.waypoint.ident === 'NEAR_OK')!;
    expect(Math.abs(near.relBearingDeg)).toBeLessThan(5);
    expect(near.eteSec).toBeGreaterThan(0);
  });

  it('honours the range filter', () => {
    const alts = computeAlternates(POS, TRACK, GS, candidates, { maxRangeNm: 50 });
    expect(alts.map((a) => a.waypoint.ident)).not.toContain('FAR_OK');
  });

  it('flags no best when nothing suitable is in range', () => {
    const alts = computeAlternates(POS, TRACK, GS, [candidates[2]!]);
    expect(alts.some((a) => a.best)).toBe(false);
  });
});
