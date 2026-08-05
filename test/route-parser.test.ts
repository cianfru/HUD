import { describe, it, expect } from 'vitest';
import { parseRoute } from '../src/data/route-parser.js';
import { DEMO_ROUTE_STRING } from '../src/data/navdata.js';

describe('parseRoute', () => {
  it('resolves the demo Gulf route to 5 waypoints', () => {
    const { waypoints, unresolved } = parseRoute(DEMO_ROUTE_STRING);
    expect(waypoints.map((w) => w.ident)).toEqual(['OTHH', 'GLF01', 'GLF02', 'GLF03', 'OMDB']);
    expect(unresolved).toHaveLength(0);
  });

  it('ignores DCT connectors and reports airways as unresolved', () => {
    const { waypoints, unresolved } = parseRoute('OTHH DCT UL425 OMDB');
    expect(waypoints.map((w) => w.ident)).toEqual(['OTHH', 'OMDB']);
    expect(unresolved).toContain('UL425');
  });

  it('accepts decimal lat,lon user waypoints', () => {
    const { waypoints } = parseRoute('OTHH 25.27,53.00 OMDB');
    expect(waypoints).toHaveLength(3);
    expect(waypoints[1]!.kind).toBe('user');
    expect(waypoints[1]!.lat).toBeCloseTo(25.27);
  });

  it('reports unknown idents as unresolved', () => {
    const { unresolved } = parseRoute('OTHH ZZZZZ OMDB');
    expect(unresolved).toContain('ZZZZZ');
  });
});
