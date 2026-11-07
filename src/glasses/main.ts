/**
 * On-glasses entry.
 *
 * The pilot sets the flight in the phone panel — paste the OFP (offline) or type
 * dep/dest/altn — which builds a briefing pack, stored on the device. The HUD
 * then flies the REAL GPS fix (Garmin GLO via the SDK) against that pack. With
 * no flight set the glasses show setup instructions; the simulated demo runs
 * only when asked for (phone button or ?demo=1) and is tagged DEMO on CRUISE.
 *
 * Touchpad / R1 ring: swipe = page; double-tap on CRUISE exits (system
 * confirmation); on the alternates page double-tap opens the METAR/TAF browser.
 */
import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
import { EvenSdkBridge } from '../bridge/even-sdk.js';
import { SdkPositionSource } from '../data/position/sdk-source.js';
import { SimulatedPositionSource } from '../data/position/sim-source.js';
import type { PositionSource } from '../data/position/source.js';
import { HudController } from '../app/controller.js';
import { FlightPlan } from '../core/flightplan.js';
import { tzOffsetMin } from '../core/time.js';
import { parseRoute } from '../data/route-parser.js';
import { DEMO_ROUTE_STRING, AIRPORTS } from '../data/navdata.js';
import { BriefingStore } from '../data/briefing.js';
import type { BriefingPack } from '../data/briefing.js';
import { DEMO_BRIEFING } from '../data/briefing-demo.js';
import { rebaseBriefing } from '../data/rebase.js';
import { packFromOfp, packFromRoute, refreshWeather } from '../data/build-pack.js';
import type { Waypoint } from '../core/types.js';
import { buildSetup } from '../hud/views.js';

const FLIGHT_KEY = 'glasses.flight';
const DEMO_KEY = 'glasses.demo';
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
  localStorage.removeItem(DEMO_KEY); // a real flight ends any demo
  location.reload();
}

/** Destination UTC offset (minutes) for arrival local time. Prefers the field's
 *  IANA time zone (DST-correct via Intl), then the curated navdata table, then a
 *  whole-hour estimate from longitude so every field still gets a local time. */
function destOffsetMin(store: BriefingStore, dest: Waypoint, ades?: string): number | undefined {
  const tz = ades ? store.airport(ades)?.tz : undefined;
  if (tz) {
    const off = tzOffsetMin(tz, new Date());
    if (off != null) return off;
  }
  const tabled = ades ? AIRPORTS[ades]?.utcOffsetMin : undefined;
  if (tabled != null) return tabled;
  if (Number.isFinite(dest.lon)) return Math.round(dest.lon / 15) * 60;
  return undefined;
}

/** Route waypoints for the flight plan; the destination carries its UTC offset
 *  (for arrival local time). */
function routeWaypoints(store: BriefingStore, adep?: string, ades?: string): Waypoint[] {
  const wps: Waypoint[] = [];
  const dep = adep ? store.asWaypoint(adep) : undefined;
  const dest = ades ? store.asWaypoint(ades) : undefined;
  if (dep) wps.push(dep);
  if (dest) {
    const off = destOffsetMin(store, dest, ades);
    wps.push(off != null ? { ...dest, utcOffsetMin: off } : dest);
  }
  return wps;
}

/**
 * Hold a screen wake lock so iOS doesn't sleep the display and suspend our JS +
 * location feed mid-flight (the HUD froze at altitude when the screen slept).
 * Re-acquired whenever the page becomes visible again. No-op where unsupported.
 */
async function keepAwake(): Promise<void> {
  const wl = (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<unknown> } }).wakeLock;
  if (!wl?.request) return;
  let lock: { release?: () => void } | null = null;
  const acquire = async (): Promise<void> => {
    try {
      lock = (await wl.request('screen')) as { release?: () => void };
    } catch (e) {
      console.warn('[glasses] wake lock unavailable:', e);
    }
  };
  await acquire();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !lock) void acquire();
    if (document.visibilityState === 'hidden') lock = null;
  });
}

/** The simulated demo runs only when asked for: the phone button, or ?demo=1. */
function demoRequested(): boolean {
  if (new URLSearchParams(location.search).has('demo')) return true;
  try {
    return localStorage.getItem(DEMO_KEY) === '1';
  } catch {
    return false;
  }
}

function updateLoaded(): void {
  const el = document.getElementById('loaded');
  const age = document.getElementById('wxage');
  const f = loadFlight();
  if (el)
    el.textContent = f
      ? `Flying ${f.adep ?? '?'} → ${f.ades ?? '?'}  (${f.pack.airports.length} fields, ` +
        `${f.pack.weather.filter((w) => w.tafRaw).length} TAFs)`
      : demoRequested()
        ? 'demo running — simulated flight, NOT live GPS'
        : 'no flight set — upload an OFP or type the route above';
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
  // Drop-the-PDF path: read the OFP PDF on the phone (dependency-free reader,
  // no network), then parse it.
  const fileInput = document.getElementById('ofp-file') as HTMLInputElement | null;
  document.getElementById('pick-pdf')?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    msg(`reading ${file.name}…`);
    try {
      const { pdfToText } = await import('../data/pdf-text.js');
      const text = await pdfToText(await file.arrayBuffer());
      buildFromOfpText(text);
    } catch (e) {
      msg('could not read that PDF: ' + (e instanceof Error ? e.message : String(e)));
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

  document.getElementById('demo')?.addEventListener('click', () => {
    localStorage.removeItem(FLIGHT_KEY);
    localStorage.setItem(DEMO_KEY, '1');
    location.reload();
  });

  document.getElementById('clear')?.addEventListener('click', () => {
    localStorage.removeItem(FLIGHT_KEY);
    localStorage.removeItem(DEMO_KEY);
    location.reload();
  });
}

/**
 * First run, no flight and no demo: put setup instructions on the glasses (never
 * a blank display). This is the root page, so double-tap exits via the system
 * confirmation dialog.
 */
async function showSetup(bridge: EvenSdkBridge): Promise<void> {
  await bridge.createPage(buildSetup());
  bridge.onGesture((g) => {
    if (g.type === 'doublePress') void bridge.shutdown(true);
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
    // Scale ETA off the OFP's planned (routed) distance, not the great circle.
    plan.plannedDistanceNm = flight.pack.routeDistanceNm;
    source = new SdkPositionSource(sdk);
    status(`flying ${flight.adep ?? '?'} → ${flight.ades ?? '?'} — live GPS`);
  } else if (!demoRequested()) {
    status('no flight set — load one below');
    await showSetup(bridge);
    return;
  } else {
    // Demo (opt-in): simulated route + bundled pack, tagged DEMO on the glasses.
    const { waypoints } = parseRoute(DEMO_ROUTE_STRING);
    // Re-based to now, so the frozen snapshot reads as a fresh briefing.
    briefing = new BriefingStore(rebaseBriefing(DEMO_BRIEFING));
    plan = new FlightPlan(waypoints);
    source = new SimulatedPositionSource(waypoints, {
      cruiseKt: 458,
      cruiseAltFt: 37000,
      updateMs: 1000,
      timeScale: 20,
      wanderNm: 0.6,
    });
    status('demo — simulated flight, NOT live GPS');
  }

  const controller = new HudController(bridge, source, plan, {
    tickMs: 1000,
    briefing,
    diversion: { maxRangeNm: 1000, limit: 6 },
    demo: !flight,
  });
  controller.start();
}

wireForm();
updateLoaded();
void keepAwake();
boot().catch((err) => status(`failed to start: ${String(err)}`));
