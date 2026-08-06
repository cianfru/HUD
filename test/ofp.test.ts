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
