/**
 * Build-time generator for src/data/airports.json.
 *
 * Downloads the OurAirports dataset (CC0) and filters to real ICAO large +
 * medium airports as compact [ident, lat, lon, name] rows. Run automatically by
 * the Vercel build so the large dataset never has to be committed or inlined.
 * Falls back to a tiny embedded list if the download fails, so the build is
 * resilient. If a good file already exists (local dev), it is left as-is.
 */
import { writeFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/airports.json');
const URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv';

const FALLBACK = [
  ['OTHH', 25.2731, 51.6081, 'Doha Hamad International'],
  ['OMDB', 25.2528, 55.3644, 'Dubai International'],
  ['EGLL', 51.47, -0.4543, 'London Heathrow'],
  ['KJFK', 40.6398, -73.7789, 'New York JFK'],
  ['KLAX', 33.9425, -118.408, 'Los Angeles Intl'],
  ['LFPG', 49.0097, 2.5479, 'Paris Charles de Gaulle'],
  ['WSSS', 1.3592, 103.9894, 'Singapore Changi'],
  ['YSSY', -33.9461, 151.1772, 'Sydney Kingsford Smith'],
];

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

async function main() {
  // Keep an existing sizeable file (local dev) instead of re-downloading.
  if (existsSync(OUT) && statSync(OUT).size > 50_000) {
    console.log('[airports] existing file kept:', OUT);
    return;
  }
  let rows = FALLBACK;
  try {
    const res = await fetch(URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const lines = text.split('\n');
    const header = parseCsvLine(lines[0]);
    const col = (n) => header.indexOf(n);
    const iType = col('type');
    const iIdent = col('ident');
    const iIcao = col('icao_code');
    const iLat = col('latitude_deg');
    const iLon = col('longitude_deg');
    const iName = col('name');
    const icao = /^[A-Z]{4}$/;
    const seen = new Set();
    const parsed = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i]) continue;
      const f = parseCsvLine(lines[i]);
      if (f[iType] !== 'large_airport' && f[iType] !== 'medium_airport') continue;
      const ident = (f[iIcao] || f[iIdent] || '').trim().toUpperCase();
      if (!icao.test(ident) || seen.has(ident)) continue;
      const lat = Number(f[iLat]);
      const lon = Number(f[iLon]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      seen.add(ident);
      parsed.push([ident, Math.round(lat * 1e4) / 1e4, Math.round(lon * 1e4) / 1e4, f[iName].trim()]);
    }
    if (parsed.length > 500) {
      parsed.sort((a, b) => (a[0] < b[0] ? -1 : 1));
      rows = parsed;
    } else {
      throw new Error(`only ${parsed.length} parsed`);
    }
  } catch (e) {
    console.warn('[airports] download failed, using fallback:', String(e));
  }
  writeFileSync(OUT, JSON.stringify({ fmt: ['ident', 'lat', 'lon', 'name'], airports: rows }));
  console.log('[airports] wrote', rows.length, 'airports →', OUT);
}

main();
