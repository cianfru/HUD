/**
 * On-glasses entry.
 *
 * The pilot sets the flight in the phone panel — paste the OFP (offline) or type
 * dep/dest/altn — which builds a briefing pack, stored on the device. The HUD
 * then flies the REAL GPS fix (Garmin GLO via the SDK) against that pack. With
 * no flight set it falls back to the bundled demo (simulated route) so there is
 * always something to see.
 *
 * Touchpad / R1 ring: swipe = page; on the alternates page swipe steps between
 * fields and double-press opens the selected field's METAR/TAF.
 */
import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
import { EvenSdkBridge } from '../bridge/even-sdk.js';
import { SdkPositionSource } from '../data/position/sdk-source.js';
import { SimulatedPositionSource } from '../data/position/sim-source.js';
import type { PositionSource } from '../data/position/source.js';
import { HudController } from '../app/controller.js';
import { FlightPlan } from '../core/flightplan.js';
import { parseRoute } from '../data/route-parser.js';
import { DEMO_ROUTE_STRING, AIRPORTS } from '../data/navdata.js';
import { BriefingStore } from '../data/briefing.js';
import type { BriefingPack } from '../data/briefing.js';
import { DEMO_BRIEFING } from '../data/briefing-demo.js';
import { packFromOfp, packFromRoute, refreshWeather } from '../data/build-pack.js';
import type { Waypoint } from '../core/types.js';

const FLIGHT_KEY = 'glasses.flight';
// Weather proxy for the typed-route path (CORS-enabled so the WebView can read it).
const WX_BASE = 'https://g2-hud-wx-cianfrus-projects.vercel.app';

interface StoredFlight {
  pack: BriefingPack;
  adep?: string;
  ades?: string;
}

function status(msg: string): void {
  const el = document.getElementById('status');
  if (el) el.textContent = msg;
  console.log('[glasses]', msg);
}
function msg(text: string): void {
  const el = document.getElementById('msg');
  if (el) el.textContent = text;
}

function loadFlight(): StoredFlight | null {
  try {
    const raw = localStorage.getItem(FLIGHT_KEY);
    if (!raw) return null;
    const f = JSON.parse(raw) as StoredFlight;
    if (f?.pack?.airports?.length) return f;
  } catch (e) {
    console.warn('[glasses] stored flight unreadable:', e);
  }
  return null;
}

function saveAndReload(flight: StoredFlight): void {
  localStorage.setItem(FLIGHT_KEY, JSON.stringify(flight));
  location.reload();
}

/** Route waypoints for the flight plan; the destination carries its UTC offset
 *  (for arrival local time) when it is a known field. */
function routeWaypoints(store: BriefingStore, adep?: string, ades?: string): Waypoint[] {
  const wps: Waypoint[] = [];
  const dep = adep ? store.asWaypoint(adep) : undefined;
  const dest = ades ? store.asWaypoint(ades) : undefined;
  if (dep) wps.push(dep);
  if (dest) {
    const off = ades ? AIRPORTS[ades]?.utcOffsetMin : undefined;
    wps.push(off != null ? { ...dest, utcOffsetMin: off } : dest);
  }
  return wps;
}

function updateLoaded(): void {
  const el = document.getElementById('loaded');
  const age = document.getElementById('wxage');
  const f = loadFlight();
  if (el)
    el.textContent = f
      ? `Flying ${f.adep ?? '?'} → ${f.ades ?? '?'}  (${f.pack.airports.length} fields, ` +
        `${f.pack.weather.filter((w) => w.tafRaw).length} TAFs)`
      : 'no flight set — flying the demo';
  if (age) {
    if (!f) age.textContent = '';
    else {
      const mins = Math.round((Date.now() - new Date(f.pack.createdAt).getTime()) / 60000);
      const withWx = f.pack.weather.filter((w) => w.tafRaw || w.metarRaw).length;
      age.textContent = `weather: ${withWx}/${f.pack.airports.length} fields · ${mins} min old`;
    }
  }
}

function buildFromOfpText(text: string): void {
  if (text.trim().length < 20) return msg('no OFP text found');
  const flight = packFromOfp(text);
  if (!flight.pack.airports.length) return msg('no known airports found in that OFP');
  msg(`built ${flight.adep ?? '?'} → ${flight.ades ?? '?'}, ${flight.pack.airports.length} fields — loading…`);
  saveAndReload(flight);
}

function wireForm(): void {
  // Drop-the-PDF path: read the OFP PDF in the WebView (pdf.js), then parse it.
  const fileInput = document.getElementById('ofp-file') as HTMLInputElement | null;
  document.getElementById('pick-pdf')?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    msg(`reading ${file.name}…`);
    try {
      const { pdfToText } = await import('./pdf-text.js');
      const text = await pdfToText(await file.arrayBuffer());
      buildFromOfpText(text);
    } catch (e) {
      msg('could not read that PDF: ' + String(e));
    }
  });

  document.getElementById('build-ofp')?.addEventListener('click', () => {
    const text = (document.getElementById('ofp') as HTMLTextAreaElement | null)?.value ?? '';
    if (text.trim().length < 20) return msg('paste the OFP text first');
    try {
      const flight = packFromOfp(text);
      if (!flight.pack.airports.length) return msg('no known airports found in that OFP');
      msg(`built ${flight.adep ?? '?'} → ${flight.ades ?? '?'}, ${flight.pack.airports.length} fields — loading…`);
      saveAndReload(flight);
    } catch (e) {
      msg('could not parse that OFP: ' + String(e));
    }
  });

  document.getElementById('build-route')?.addEventListener('click', async () => {
    const val = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value.trim().toUpperCase() ?? '';
    const dep = val('dep');
    const dest = val('dest');
    const altn = val('altn');
    if (!/^[A-Z]{4}$/.test(dep) || !/^[A-Z]{4}$/.test(dest)) return msg('enter valid DEP and DEST ICAO idents');
    msg('building route + fetching weather…');
    try {
      const flight = await packFromRoute(dep, dest, altn ? [altn] : [], { wxBase: WX_BASE });
      msg(`built ${dep} → ${dest}, ${flight.pack.airports.length} fields — loading…`);
      saveAndReload(flight);
    } catch (e) {
      msg('could not build that route: ' + String(e));
    }
  });

  // Freeze fresh weather into the loaded flight (press before departure).
  document.getElementById('fetch-wx')?.addEventListener('click', async () => {
    const f = loadFlight();
    if (!f) return msg('set a flight first');
    msg('fetching latest weather…');
    try {
      const pack = await refreshWeather(f.pack, WX_BASE);
      const n = pack.weather.filter((w) => w.tafRaw || w.metarRaw).length;
      if (n === 0) return msg('weather fetch returned nothing (check connection)');
      msg(`weather updated: ${n}/${pack.airports.length} fields — loading…`);
      saveAndReload({ ...f, pack });
    } catch (e) {
      msg('weather fetch failed: ' + String(e));
    }
  });

  document.getElementById('clear')?.addEventListener('click', () => {
    localStorage.removeItem(FLIGHT_KEY);
    location.reload();
  });
}

async function boot(): Promise<void> {
  status('waiting for Even bridge…');
  const sdk = await waitForEvenAppBridge();
  const bridge = new EvenSdkBridge(sdk);

  const flight = loadFlight();
  let source: PositionSource;
  let plan: FlightPlan;
  let briefing: BriefingStore;

  if (flight) {
    // Real flight: GLO/phone GPS + the pack the pilot set up.
    briefing = new BriefingStore(flight.pack);
    plan = new FlightPlan(routeWaypoints(briefing, flight.adep, flight.ades));
    source = new SdkPositionSource(sdk);
    status(`flying ${flight.adep ?? '?'} → ${flight.ades ?? '?'} — live GPS`);
  } else {
    // Demo: simulated route + bundled pack.
    const { waypoints } = parseRoute(DEMO_ROUTE_STRING);
    briefing = new BriefingStore(DEMO_BRIEFING);
    plan = new FlightPlan(waypoints);
    source = new SimulatedPositionSource(waypoints, {
      cruiseKt: 458,
      cruiseAltFt: 37000,
      updateMs: 1000,
      timeScale: 20,
      wanderNm: 0.6,
    });
    status('demo — no flight set (simulated route)');
  }

  const controller = new HudController(bridge, source, plan, {
    tickMs: 1000,
    briefing,
    diversion: { maxRangeNm: 1000, limit: 6 },
  });
  controller.start();
}

wireForm();
updateLoaded();
boot().catch((err) => status(`failed to start: ${String(err)}`));
