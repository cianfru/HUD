/**
 * Pre-flight briefing-pack builder (the "download before the flight" step).
 *
 * Given the flight's airport set — origin, destination, destination alternates,
 * and the ETOPS en-route alternates — this fetches each field's METAR + TAF
 * (NOAA, global) and joins runway length/surface (OurAirports), then writes a
 * self-contained JSON pack. In the air the app runs entirely from that pack.
 *
 * Usage:  node scripts/build-briefing.mjs OTHH EGLL BIKF EINN ...  [--out pack.json]
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

const AP_CSV = 'https://davidmegginson.github.io/ourairports-data/airports.csv';
const RWY_CSV = 'https://davidmegginson.github.io/ourairports-data/runways.csv';
const WX = 'https://aviationweather.gov/api/data';

const args = process.argv.slice(2);
const flagVal = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const out = flagVal('--out');
// Optional OFP-sourced weather: { ICAO: { tafRaw, metarRaw, metarObsSec } }.
// When present it is authoritative (it IS the dispatch briefing); NOAA only
// fills gaps. Lets a pack be built from the OFP even if NOAA is unreachable.
const wxFile = flagVal('--wx');
const flagValues = new Set([out, wxFile].filter(Boolean));
const idents = args
  .filter((a) => !a.startsWith('--') && !flagValues.has(a))
  .map((s) => s.toUpperCase())
  .filter((s) => /^[A-Z]{4}$/.test(s));

if (idents.length === 0) {
  console.error('give ICAO idents, e.g. node scripts/build-briefing.mjs OTHH EGLL BIKF');
  process.exit(1);
}

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
  return { header, rows: lines.slice(1).filter(Boolean).map(parseCsvLine) };
}

const HARD = /asph|concrete|paved|asphalt|\bpem\b|\bbit\b|\bcon\b|\basp\b|tarmac/i;

async function main() {
  const want = new Set(idents);
  console.log('[briefing] idents:', idents.join(' '));

  const ap = await csv(AP_CSV);
  const ci = (n) => ap.header.indexOf(n);
  const airports = [];
  for (const r of ap.rows) {
    const id = (r[ci('icao_code')] || r[ci('ident')] || '').toUpperCase();
    if (!want.has(id)) continue;
    airports.push({
      ident: id,
      name: r[ci('name')],
      lat: Math.round(+r[ci('latitude_deg')] * 1e4) / 1e4,
      lon: Math.round(+r[ci('longitude_deg')] * 1e4) / 1e4,
      elevFt: r[ci('elevation_ft')] ? +r[ci('elevation_ft')] : undefined,
    });
  }

  const rwy = await csv(RWY_CSV);
  const rc = (n) => rwy.header.indexOf(n);
  const byId = new Map(airports.map((a) => [a.ident, a]));
  for (const r of rwy.rows) {
    const id = (r[rc('airport_ident')] || '').toUpperCase();
    const a = byId.get(id);
    if (!a) continue;
    const len = +r[rc('length_ft')];
    if (Number.isFinite(len) && len > 0) a.longestRwyFt = Math.max(a.longestRwyFt || 0, len);
    if (HARD.test(r[rc('surface')] || '')) a.hardSurface = true;
  }

  const override = wxFile ? JSON.parse(readFileSync(wxFile, 'utf8')) : {};

  // NOAA is best-effort: if it is down/unreachable we can still ship a pack
  // whenever the OFP override covers the fields.
  let metarBy = new Map();
  let tafBy = new Map();
  const ids = airports.map((a) => a.ident).join(',');
  try {
    const [metars, tafs] = await Promise.all([
      fetch(`${WX}/metar?ids=${ids}&format=json`).then((r) => r.json()),
      fetch(`${WX}/taf?ids=${ids}&format=json`).then((r) => r.json()),
    ]);
    metarBy = new Map((metars || []).map((m) => [m.icaoId, m]));
    tafBy = new Map((tafs || []).map((t) => [t.icaoId, t.rawTAF]));
  } catch (e) {
    console.warn('[briefing] NOAA unreachable, relying on provided weather:', e.message);
  }

  const weather = airports.map((a) => {
    const o = override[a.ident] || {};
    return {
      ident: a.ident,
      metarRaw: o.metarRaw ?? metarBy.get(a.ident)?.rawOb,
      metarObsSec: o.metarObsSec ?? metarBy.get(a.ident)?.obsTime,
      tafRaw: o.tafRaw ?? tafBy.get(a.ident), // OFP forecast wins over NOAA
    };
  });

  const pack = {
    version: 1,
    createdAt: new Date().toISOString(),
    route: idents.join(' '),
    airports,
    weather,
  };

  const file = out || `briefing/${idents[0]}-${idents[idents.length - 1]}.json`;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(pack, null, 2));
  const withTaf = weather.filter((w) => w.tafRaw).length;
  console.log(
    `[briefing] wrote ${file}: ${airports.length} airports, ${withTaf} TAFs, ` +
      `${airports.filter((a) => a.longestRwyFt).length} with runway data`,
  );
}

main().catch((e) => {
  console.error('[briefing] failed:', e);
  process.exit(1);
});
