import { describe, it, expect } from 'vitest';
import { WeatherStore, suitableFromCat } from '../src/data/weather.js';

describe('suitableFromCat', () => {
  it('treats LIFR as not suitable, everything else (incl. unknown) as suitable', () => {
    expect(suitableFromCat('VFR')).toBe(true);
    expect(suitableFromCat('MVFR')).toBe(true);
    expect(suitableFromCat('IFR')).toBe(true);
    expect(suitableFromCat('LIFR')).toBe(false);
    expect(suitableFromCat('UNKN')).toBe(true);
  });
});

describe('WeatherStore.ensure', () => {
  const now = () => 1_000_000_000_000;
  function fakeFetch(payload: unknown): typeof fetch {
    return (async () =>
      ({ ok: true, json: async () => payload }) as Response) as unknown as typeof fetch;
  }

  it('parses METAR + TAF and drives suitability', async () => {
    const store = new WeatherStore(
      '',
      now,
      fakeFetch({
        metars: [
          { icaoId: 'EGLL', fltCat: 'VFR', rawOb: 'METAR EGLL ...', obsTime: 999_999_000 },
          { icaoId: 'KSFO', fltCat: 'LIFR', rawOb: 'METAR KSFO ...', obsTime: 999_999_000 },
        ],
        tafs: [{ icaoId: 'EGLL', rawTAF: 'TAF EGLL ...' }],
      }),
    );
    await store.ensure(['EGLL', 'KSFO', 'ZZZZ']);

    expect(store.get('EGLL')?.fltCat).toBe('VFR');
    expect(store.get('EGLL')?.tafRaw).toBe('TAF EGLL ...');
    expect(store.suitability('EGLL')).toBe(true);
    expect(store.suitability('KSFO')).toBe(false); // LIFR
    // Unknown ident with no data is cached as UNKN → still "suitable" by default.
    expect(store.get('ZZZZ')?.fltCat).toBe('UNKN');
    expect(store.suitability('ZZZZ')).toBe(true);
  });

  it('reports observation age in seconds', () => {
    const nowMs = 1_000_000_000_000; // → now = 1_000_000_000 s
    const store = new WeatherStore('', () => nowMs, fakeFetch({}));
    (store as unknown as { cache: Map<string, unknown> }).cache.set('EGLL', {
      ident: 'EGLL',
      fltCat: 'VFR',
      metarRaw: null,
      tafRaw: null,
      observedSec: 999_999_000, // 1000 s before now
      fetchedMs: 0,
    });
    expect(store.ageSec('EGLL')).toBe(1000);
  });
});
