/**
 * OFP -> airport set -> (optionally) a briefing pack.
 *
 * Reads an Operational Flight Plan — a real digital PDF, or an already-extracted
 * .txt — pulls its airport set (ADEP/ADES, takeoff + destination alternates, and
 * the ETOPS/en-route alternates), validates every ident against the real
 * OurAirports database, and prints the classified result. With --build it hands
 * the idents straight to scripts/build-briefing.mjs to produce the offline pack.
 *
 * Usage:
 *   node scripts/parse-ofp.mjs myofp.pdf
 *   node scripts/parse-ofp.mjs myofp.txt --build            # also write the pack
 *   node scripts/parse-ofp.mjs myofp.pdf --build --out briefing/qtr61.json
 *
 * Digital OFPs carry a text layer, so no OCR is needed. A scanned/printed OFP
 * would need OCR first (out of scope) — export it as text and pass the .txt.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractOfp } from '../src/data/ofp.ts';

const AP_CSV = 'https://davidmegginson.github.io/ourairports-data/airports.csv';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const build = args.includes('--build');
const outIdx = args.indexOf('--out');
const out = outIdx >= 0 ? args[outIdx + 1] : null;

if (!file) {
  console.error('usage: node scripts/parse-ofp.mjs <ofp.pdf|ofp.txt> [--build] [--out pack.json]');
  process.exit(1);
}

async function pdfToText(path) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(readFileSync(path));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  let text = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // Reassemble lines from item positions: a large Y jump starts a new line.
    let lastY = null;
    for (const it of content.items) {
      const y = it.transform?.[5];
      if (lastY != null && Math.abs(y - lastY) > 2) text += '\n';
      text += it.str + (it.hasEOL ? '\n' : ' ');
      lastY = y;
    }
    text += '\n';
  }
  return text;
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

async function loadAirports() {
  const r = await fetch(AP_CSV);
  if (!r.ok) throw new Error(`${AP_CSV} -> ${r.status}`);
  const lines = (await r.text()).split('\n');
  const header = parseCsvLine(lines[0]);
  const icaoCol = header.indexOf('icao_code');
  const identCol = header.indexOf('ident');
  const set = new Set();
  for (const line of lines.slice(1)) {
    if (!line) continue;
    const cols = parseCsvLine(line);
    // Take both the ICAO code and the ident — either can be the 4-letter code.
    for (const id of [cols[icaoCol], cols[identCol]]) {
      const up = (id || '').toUpperCase();
      if (/^[A-Z]{4}$/.test(up)) set.add(up);
    }
  }
  return set;
}

async function main() {
  const raw = file.toLowerCase().endsWith('.pdf')
    ? await pdfToText(file)
    : readFileSync(file, 'utf8');

  console.log('[ofp] loading airport database…');
  const airports = await loadAirports();
  const x = extractOfp(raw, { isAirport: (id) => airports.has(id) });

  console.log('\n=== OFP airport set ===');
  console.log('ADEP (origin)      :', x.adep ?? '—');
  console.log('ADES (destination) :', x.ades ?? '—');
  console.log('Takeoff alternate  :', x.takeoffAlternate ?? '—');
  console.log('Dest alternates    :', x.destAlternates.join(' ') || '—');
  console.log('ETOPS/en-route ALTN:', x.enrouteAlternates.join(' ') || '—');
  console.log('All airports found :', x.allAirports.join(' '));
  const withTaf = x.airports.filter((a) => a.tafRaw).length;
  if (x.airports.length)
    console.log(`Inline weather     : ${withTaf}/${x.airports.length} airports carry a TAF`);
  if (x.routeTokens.length) console.log('Route (field 15)   :', x.routeTokens.join(' '));
  for (const w of x.warnings) console.warn('  ! ' + w);

  // The pack wants origin + destination first, then every distinct alternate.
  const ordered = [];
  const push = (id) => id && !ordered.includes(id) && ordered.push(id);
  push(x.adep);
  push(x.ades);
  push(x.takeoffAlternate);
  x.destAlternates.forEach(push);
  x.enrouteAlternates.forEach(push);
  x.allAirports.forEach(push); // sweep up anything classified loosely

  if (!build) {
    console.log('\nidents:', ordered.join(' '));
    console.log('(add --build to join runways + write the pack, using the OFP TAFs)');
    return;
  }

  // Hand the OFP's own METAR/TAF to the pack builder so the pack carries the
  // dispatch briefing's forecasts; NOAA only fills any gaps.
  const wx = {};
  for (const a of x.airports) {
    if (a.tafRaw || a.metarRaw) wx[a.ident] = { tafRaw: a.tafRaw, metarRaw: a.metarRaw };
  }
  const wxFile = join(tmpdir(), `ofp-wx-${ordered.join('-').slice(0, 40)}.json`);
  mkdirSync(tmpdir(), { recursive: true });
  writeFileSync(wxFile, JSON.stringify(wx));

  const buildArgs = [...ordered, '--wx', wxFile];
  if (out) buildArgs.push('--out', out);
  console.log(
    `\n[ofp] building briefing pack for ${ordered.length} airports ` +
      `(${Object.keys(wx).length} with OFP weather)…`,
  );
  const buildScript = fileURLToPath(new URL('./build-briefing.mjs', import.meta.url));
  const res = spawnSync('node', [buildScript, ...buildArgs], { stdio: 'inherit' });
  process.exit(res.status ?? 0);
}

main().catch((e) => {
  console.error('[ofp] failed:', e);
  process.exit(1);
});
