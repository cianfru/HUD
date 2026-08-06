import { describe, it, expect } from 'vitest';
import { extractOfp } from '../src/data/ofp.js';

// Stand-in for the airport DB the CLI wires in. Only real airports pass, so
// dense non-airport tokens (DOHA, FUEL, WIND, INTL...) are dropped.
const AIRPORTS = new Set([
  'OTHH', 'EDDF', 'EDDS', 'EDDM', 'OMDB', 'OMAA', 'OOMS', 'OEJN', 'HECA', 'LGAV', 'LTBA',
]);
const isAirport = (id: string) => AIRPORTS.has(id);

// A synthetic OFP that mixes the labelling conventions real dispatch systems
// use (runway-annotated city pair, "DEST ALTN", "ETOPS ALTN", a field-15 route).
const OFP = `
QTR61   A7-AHX  A320-232        05AUG2026
OTHH/16R  EDDF/25C
ADEP OTHH  DOHA HAMAD INTL
ADES EDDF  FRANKFURT MAIN
DEST ALTN  EDDS STUTTGART   EDDM MUENCHEN
TKOF ALTN  OMDB DUBAI INTL
ETOPS ALTN OMAA OOMS OEJN HECA LGAV
ENRT ALTN  LTBA ISTANBUL
ROUTE: OTHH DCT ALSER UL602 RUBUN UM688 EDDF
TRIP FUEL 18400   TAXI 400   MORA 9800
`;

describe('extractOfp', () => {
  const x = extractOfp(OFP, { isAirport });

  it('pulls origin and destination', () => {
    expect(x.adep).toBe('OTHH');
    expect(x.ades).toBe('EDDF');
  });

  it('separates destination alternates from the takeoff alternate', () => {
    expect(x.destAlternates).toEqual(['EDDS', 'EDDM']);
    expect(x.takeoffAlternate).toBe('OMDB');
  });

  it('captures the full ETOPS/en-route alternate set (far off centerline)', () => {
    // ETOPS ALTN and ENRT ALTN are both en-route alternates — grouped together.
    expect(x.enrouteAlternates).toEqual(['OMAA', 'OOMS', 'OEJN', 'HECA', 'LGAV', 'LTBA']);
  });

  it('does not misclassify dense non-airport tokens as fields', () => {
    // DOHA, INTL, FUEL, TAXI, MORA, FRANKFURT... are not real airports.
    expect(x.allAirports).not.toContain('DOHA');
    expect(x.allAirports).not.toContain('FUEL');
    for (const id of x.allAirports) expect(AIRPORTS.has(id)).toBe(true);
  });

  it('captures the field-15 route best-effort', () => {
    expect(x.routeTokens.slice(0, 3)).toEqual(['OTHH', 'DCT', 'ALSER']);
    expect(x.routeTokens).toContain('UL602');
  });

  it('warns when a required field is missing', () => {
    const y = extractOfp('ADEP OTHH\nROUTE: OTHH DCT EDDF', { isAirport });
    expect(y.warnings.join(' ')).toMatch(/destination/i);
  });
});

// A compact stand-in for the real Qatar Airways / Lido layout: a ROUTE summary
// line, section headers, "ICAO/IATA  NAME" airport headers, inline METAR (SA)
// and TAF (FT) blocks ending with "=", a page footer mid-section, an airport
// with no weather, and a NOTAMS terminator.
const QR_AIRPORTS = new Set(['OTHH', 'OMSJ', 'OOMS', 'OTBD', 'OTBH', 'OBBI']);
const QR_OFP = `
QTR1060/04AUG   OFP-NR: 2
ROUTE:   OTHH   -   OMSJ   ALTN:OOMS OTHH
N0380F210   ALSEM L305   ASTOG/N0380F210   L305   EMOTA   R784 GONVI

DESTINATION   AIRPORT:
OMSJ/SHJ   SHARJAH INTL
SA   042100 12006KT   CAVOK   36/18   Q0999   NOSIG=
FT   041700 0418/0600   10007KT CAVOK
BECMG   0504/0506   18010KT=

DESTINATION   ALTERNATE:
OOMS/MCT   MUSCAT   INTL
FT   041700 0418/0524   VRB02KT 8000   NSC
PROB40 TEMPO 0422/0502   4000 BR   BKN015=

ENROUTE AIRPORT(S):
OTBD/DIA   DOHA   INTL
FT   041703 0418/0524   04007KT 8000   NSC
QTR 1060/04Aug26/OTHH-OMSJ Reg:A7LAB OFP:2/0/0
Page 13   of 44
===PAGE 13===
TEMPO   0520/0524   VRB03KT=
OTBH/XJD   AL UDEID   AB
FC/FT   WX   NOT AVAILABLE
OBBI/BAH   BAHRAIN INTL
FT   041639 0418/0600   07008KT CAVOK=

NOTAMS
OERK RIYADH KING KHALED
OMDB DUBAI INTL
`;

describe('extractOfp — Lido/QR section layout', () => {
  const x = extractOfp(QR_OFP, { isAirport: (id) => QR_AIRPORTS.has(id) });

  it('reads origin/destination/alternates from the ROUTE summary line', () => {
    expect(x.adep).toBe('OTHH');
    expect(x.ades).toBe('OMSJ');
    expect(x.destAlternates).toEqual(['OOMS', 'OTHH']);
  });

  it('collects the en-route list across a page break', () => {
    // OTBD's TAF wraps across a page footer; OBBI comes after it.
    expect(x.enrouteAlternates).toEqual(['OTBD', 'OTBH', 'OBBI']);
  });

  it('does not sweep in airports named in the NOTAMs after the section ends', () => {
    expect(x.allAirports).not.toContain('OERK');
    expect(x.allAirports).not.toContain('OMDB');
  });

  it('reconstructs a parseable inline TAF per airport', () => {
    const omsj = x.airports.find((a) => a.ident === 'OMSJ')!;
    expect(omsj.tafRaw).toBe('TAF OMSJ 041700Z 0418/0600 10007KT CAVOK BECMG 0504/0506 18010KT');
    // The airport with no forecast carries none rather than a bogus string.
    const otbh = x.airports.find((a) => a.ident === 'OTBH')!;
    expect(otbh.tafRaw).toBeUndefined();
  });

  it('reconstructs the METAR when an SA line is present', () => {
    const omsj = x.airports.find((a) => a.ident === 'OMSJ')!;
    expect(omsj.metarRaw).toBe('OMSJ 042100Z 12006KT CAVOK 36/18 Q0999 NOSIG');
  });
});
