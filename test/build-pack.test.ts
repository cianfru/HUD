import { describe, it, expect } from 'vitest';
import { packFromOfp, packFromRoute } from '../src/data/build-pack.js';

// Compact Lido/QR-style OFP with real Gulf idents (present in the bundled DB).
const OFP = `
QTR1060/04AUG   OFP-NR: 2
ROUTE:   OMDB   -   OMSJ   ALTN:OOMS OMDB
N0380F210   ALSEM L305   EMOTA   R784 GONVI

DESTINATION   AIRPORT:
OMSJ/SHJ   SHARJAH INTL
FT   041700 0418/0600   10007KT CAVOK=

DESTINATION   ALTERNATE:
OOMS/MCT   MUSCAT   INTL
FT   041700 0418/0524   VRB02KT 8000   NSC=

ENROUTE AIRPORT(S):
OBBI/BAH   BAHRAIN INTL
FT   041639 0418/0600   07008KT CAVOK=
OMAA/AUH   ABU DHABI INTL
FT   041700 0418/0600   08008KT 8000 NSC=

NOTAMS
`;

describe('packFromOfp (offline)', () => {
  const { pack, adep, ades } = packFromOfp(OFP, new Date('2026-08-04T17:00:00Z'));

  it('reads origin/destination from the OFP', () => {
    expect(adep).toBe('OMDB');
    expect(ades).toBe('OMSJ');
  });

  it('fills coordinates + runways from the bundled DB', () => {
    const omsj = pack.airports.find((a) => a.ident === 'OMSJ')!;
    expect(omsj.lat).toBeGreaterThan(20);
    expect(omsj.longestRwyFt).toBeGreaterThan(3000);
    expect(omsj.runwayHeadingsDeg?.length).toBeGreaterThan(0);
  });

  it('takes weather from the OFP itself (no network)', () => {
    expect(pack.weather.find((w) => w.ident === 'OMSJ')?.tafRaw).toMatch(/TAF OMSJ/);
    expect(pack.weather.find((w) => w.ident === 'OBBI')?.tafRaw).toMatch(/CAVOK/);
  });
});

describe('packFromRoute (typed dep/dest/altn)', () => {
  it('adds corridor alternates and keeps the entered fields', async () => {
    const { pack, adep, ades } = await packFromRoute('OMDB', 'OBBI', ['OOMS']);
    expect(adep).toBe('OMDB');
    expect(ades).toBe('OBBI');
    const ids = pack.airports.map((a) => a.ident);
    expect(ids).toContain('OMDB');
    expect(ids).toContain('OBBI');
    expect(ids).toContain('OOMS');
    // Corridor between Dubai and Bahrain should sweep in more Gulf fields.
    expect(pack.airports.length).toBeGreaterThan(3);
  });
});
