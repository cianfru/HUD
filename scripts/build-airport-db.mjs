/**
 * Build-time generator for src/data/airport-db.json — a compact, bundled airport
 * database (coordinates + runway data) so a briefing pack can be assembled
 * on-device from an OFP with NO network: the OFP supplies the idents and the
 * weather, this supplies each field's position and runways.
 *
 * Source: OurAirports (CC0). Filtered to large/medium airports with an ICAO
 * ident and at least one runway. Compact row format keeps it ~0.5 MB.
 *
 * Run: node scripts/build-airport-db.mjs
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/airport-db.json');
const AP = 'https://davidmegginson.github.io/ourairports-data/airports.csv';
const RWY = 'https://davidmegginson.github.io/ourairports-data/runways.csv';
const HARD = /asph|concrete|paved|asphalt|\bpem\b|\bbit\b|\bcon\b|\basp\b|tarmac/i;

function parseCsvLine(line) {
  const o = [];
  let c = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { c += '"'; i++; }
      else if (ch === '"') q = false;
      else c += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { o.push(c); c = ''; }
    else c += ch;
  }
  o.push(c);
  return o;
}

async function csv(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  const lines = (await r.text()).split('\n');
  const header = parseCsvLine(lines[0]);
  return { i: (n) => header.indexOf(n), rows: lines.slice(1).filter(Boolean).map(parseCsvLine) };
}

async function main() {
  console.log('[airport-db] fetching airports…');
  const ap = await csv(AP);
  const want = new Set(['large_airport', 'medium_airport']);
  // Key by the OurAirports `ident` — that is what runways.csv joins on. The
  // OUTPUT id is the current ICAO (icao_code) when present, which can differ
  // from the legacy ident (e.g. Uzbekistan's UTTT was reassigned to UZTT, and
  // OurAirports now carries icao_code=UZTT, ident=UTTT). Keying by ident keeps
  // the runway join working; storing by icao_code matches what OFPs/charts use.
  const byIdent = new Map();
  for (const r of ap.rows) {
    if (!want.has(r[ap.i('type')])) continue;
    const ident = (r[ap.i('ident')] || '').toUpperCase();
    const icao = (r[ap.i('icao_code')] || '').toUpperCase();
    const id = /^[A-Z]{4}$/.test(icao) ? icao : ident;
    if (!/^[A-Z]{4}$/.test(id)) continue;
    byIdent.set(ident, {
      id,
      ident,
      lat: Math.round(+r[ap.i('latitude_deg')] * 1e4) / 1e4,
      lon: Math.round(+r[ap.i('longitude_deg')] * 1e4) / 1e4,
      name: (r[ap.i('name')] || '').slice(0, 40),
      elev: r[ap.i('elevation_ft')] ? Math.round(+r[ap.i('elevation_ft')]) : 0,
      rwyFt: 0,
      hard: 0,
      hdgs: new Set(),
    });
  }

  console.log('[airport-db] fetching runways…');
  const rwy = await csv(RWY);
  for (const r of rwy.rows) {
    if (r[rwy.i('closed')] === '1') continue;
    const a = byIdent.get((r[rwy.i('airport_ident')] || '').toUpperCase());
    if (!a) continue;
    const len = +r[rwy.i('length_ft')];
    if (Number.isFinite(len) && len > a.rwyFt) a.rwyFt = Math.round(len);
    if (HARD.test(r[rwy.i('surface')] || '')) a.hard = 1;
    for (const col of ['le_heading_degT', 'he_heading_degT']) {
      const h = +r[rwy.i(col)];
      if (Number.isFinite(h)) a.hdgs.add(Math.round(h) % 360);
    }
  }

  // Keep every large/medium field. A field with no runway data (rwyFt 0) still
  // resolves as a destination (position/name); it just won't be offered as an
  // A320 alternate, which needs a known runway length + hard surface.
  const airports = [...byIdent.values()].map((a) => [
    a.id, a.lat, a.lon, a.name, a.elev, a.rwyFt, a.hard, [...a.hdgs].sort((x, y) => x - y),
  ]);

  // Legacy-code aliases: where the current ICAO differs from the OurAirports
  // ident, let the old ident resolve too (so typing UTTT still finds UZTT),
  // unless the old ident is itself a primary id for another field.
  const primary = new Set(airports.map((a) => a[0]));
  const aliases = {};
  for (const a of byIdent.values()) {
    if (a.id !== a.ident && /^[A-Z]{4}$/.test(a.ident) && !primary.has(a.ident)) aliases[a.ident] = a.id;
  }

  const out = {
    fmt: ['ident', 'lat', 'lon', 'name', 'elevFt', 'longestRwyFt', 'hard', 'headings'],
    airports,
    aliases,
  };
  writeFileSync(OUT, JSON.stringify(out));
  console.log(
    `[airport-db] wrote ${OUT}: ${airports.length} airports, ${Object.keys(aliases).length} aliases`,
  );
}

main().catch((e) => {
  console.error('[airport-db] failed:', e);
  process.exit(1);
});
