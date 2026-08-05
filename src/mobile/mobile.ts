/**
 * Phone MVP. Runs the real HUD renderers on an iPhone (or Android) in the
 * browser, fed by the device's own sensors — no glasses required.
 *
 *  - GPS         → position, ground speed, track, GPS altitude (navigator.geolocation)
 *  - Compass     → look direction in HANDHELD mode (DeviceOrientation heading)
 *  - Motion      → rough aircraft attitude in MOUNTED mode (beta/gamma, zeroable)
 *
 * HANDHELD: hold the phone up and pan it; airports appear by real bearing; tap
 * to lock the field under the reticle. MOUNTED: cradle it on the glareshield for
 * the PFD / diversion / attitude picture.
 *
 * iOS requires a user gesture to grant motion + a secure (HTTPS) context.
 */
import { computeAlternates } from '../core/diversion.js';
import type { AlternateCandidate, Alternate } from '../core/diversion.js';
import { nearbyAirports, airportCount } from '../data/airports.js';
import { angleDiffDeg } from '../core/geo.js';
import { MPS_TO_KNOTS, METERS_TO_FEET } from '../core/units.js';
import { formatUtcClock } from '../core/time.js';
import { drawPfd, drawPfdMinimal, NIGHT, DAY, PFD_W, PFD_H } from '../hud/pfd.js';
import type { PfdState } from '../hud/pfd.js';
import { drawTargetView, pickCandidate } from '../hud/target.js';
import type { TargetViewState, LockedTarget } from '../hud/target.js';
import type { Position } from '../core/types.js';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const display = $('hud') as HTMLCanvasElement;
const dctx = display.getContext('2d')!;
const off = document.createElement('canvas');
off.width = PFD_W;
off.height = PFD_H;
const octx = off.getContext('2d')!;

type Mode = 'HANDHELD' | 'MOUNTED';
type View = 'TARGET' | 'PFD' | 'MINIMAL';

let fix: Position | null = null;
let compassDeg: number | null = null;
let beta = 0;
let gamma = 0;
let beta0 = 0;
let gamma0 = 0;
let mode: Mode = 'HANDHELD';
let view: View = 'TARGET';
let day = false;
let lockedIdent: string | null = null;
let gpsMsg = 'waiting for GPS…';

// --- sizing ---
function resize(): void {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  display.width = Math.round(window.innerWidth * dpr);
  display.height = Math.round(window.innerHeight * dpr);
}
window.addEventListener('resize', resize);
resize();

// --- sensors ---
function onOrientation(e: DeviceOrientationEvent): void {
  const heading = (e as unknown as { webkitCompassHeading?: number }).webkitCompassHeading;
  if (typeof heading === 'number' && !Number.isNaN(heading)) compassDeg = heading;
  else if (e.alpha != null) compassDeg = (360 - e.alpha) % 360; // fallback (less reliable)
  if (e.beta != null) beta = e.beta;
  if (e.gamma != null) gamma = e.gamma;
}

function onPosition(p: GeolocationPosition): void {
  const c = p.coords;
  fix = {
    lat: c.latitude,
    lon: c.longitude,
    altitudeM: c.altitude ?? undefined,
    speedMps: c.speed != null && !Number.isNaN(c.speed) ? c.speed : undefined,
    trackDeg: c.heading != null && !Number.isNaN(c.heading) ? c.heading : undefined,
    accuracyM: c.accuracy,
    timestamp: p.timestamp,
  };
  gpsMsg = `GPS ±${Math.round(c.accuracy)}m · ${airportCount()} airports loaded`;
}

async function requestPermissions(): Promise<void> {
  const DO = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
  const DM = window.DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
  try {
    if (DO && typeof DO.requestPermission === 'function') await DO.requestPermission();
    if (DM && typeof DM.requestPermission === 'function') await DM.requestPermission();
  } catch {
    showError('Motion access was denied — attitude/compass will be unavailable.');
  }
  window.addEventListener('deviceorientation', onOrientation, true);

  if ('geolocation' in navigator) {
    navigator.geolocation.watchPosition(onPosition, (err) => showError(`GPS: ${err.message}`), {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 15000,
    });
  } else {
    showError('This browser has no Geolocation.');
  }

  try {
    // Keep the screen awake if supported.
    await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<unknown> } }).wakeLock?.request('screen');
  } catch {
    /* non-fatal */
  }
}

function showError(msg: string): void {
  const el = $('err');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 6000);
}

// --- state assembly ---
function candidates(): AlternateCandidate[] {
  if (!fix) return [];
  // No live weather yet, so every nearby field is treated as suitable.
  return nearbyAirports(fix, 250, 12).map((waypoint) => ({ waypoint, suitable: true }));
}

function alternates(): Alternate[] {
  if (!fix) return [];
  const gsKt = fix.speedMps != null ? fix.speedMps * MPS_TO_KNOTS : null;
  const track = fix.trackDeg ?? 0;
  return computeAlternates(fix, track, gsKt, candidates(), { maxRangeNm: 250 });
}

function headOffset(): number {
  if (mode !== 'HANDHELD' || compassDeg == null || !fix) return 0;
  return angleDiffDeg(compassDeg, fix.trackDeg ?? 0);
}

function lockedTarget(alts: Alternate[]): LockedTarget | null {
  if (!lockedIdent) return null;
  const a = alts.find((x) => x.waypoint.ident === lockedIdent);
  if (!a) return null;
  return {
    ident: a.waypoint.ident,
    name: a.waypoint.name ?? a.waypoint.ident,
    bearingDeg: a.bearingDeg,
    distanceNm: a.distanceNm,
    eteSec: a.eteSec,
    suitable: a.suitable,
    rwy: '— (no navdata in MVP)',
    metar: 'weather uplink: not wired yet',
  };
}

function pfdState(): PfdState {
  const gsKt = fix?.speedMps != null ? fix.speedMps * MPS_TO_KNOTS : null;
  const altFt = fix?.altitudeM != null ? fix.altitudeM * METERS_TO_FEET : null;
  return {
    gsKt,
    altFt,
    trackDeg: fix?.trackDeg ?? null,
    clock: formatUtcClock(new Date()) + 'Z',
    mode: 'CRUISE',
    alternates: alternates(),
  };
}

function targetState(): TargetViewState {
  const gsKt = fix?.speedMps != null ? fix.speedMps * MPS_TO_KNOTS : null;
  const altFt = fix?.altitudeM != null ? fix.altitudeM * METERS_TO_FEET : null;
  const alts = alternates();
  const attitude =
    mode === 'MOUNTED' ? { pitchDeg: beta - beta0, rollDeg: -(gamma - gamma0) } : null;
  return {
    alternates: alts,
    gsKt,
    altFt,
    trackDeg: fix?.trackDeg ?? null,
    headOffsetDeg: headOffset(),
    locked: lockedTarget(alts),
    attitude,
    headRollDeg: 0,
  };
}

// --- render loop ---
function frame(): void {
  const pal = day ? DAY : NIGHT;
  if (view === 'TARGET') drawTargetView(octx, targetState(), pal);
  else if (view === 'MINIMAL') drawPfdMinimal(octx, pfdState(), pal);
  else drawPfd(octx, pfdState(), pal);

  // Fit 576×288 into the screen (contain), black letterbox.
  dctx.setTransform(1, 0, 0, 1, 0, 0);
  dctx.fillStyle = '#000';
  dctx.fillRect(0, 0, display.width, display.height);
  const scale = Math.min(display.width / PFD_W, display.height / PFD_H);
  const w = PFD_W * scale;
  const h = PFD_H * scale;
  dctx.imageSmoothingEnabled = true;
  dctx.drawImage(off, (display.width - w) / 2, (display.height - h) / 2, w, h);

  $('hint').textContent =
    `${mode} · ${view}` +
    (compassDeg != null ? ` · LOOK ${Math.round(compassDeg).toString().padStart(3, '0')}` : '') +
    ` · ${gpsMsg}`;

  requestAnimationFrame(frame);
}

// --- controls ---
display.addEventListener('pointerdown', () => {
  if (view !== 'TARGET') return;
  if (lockedIdent) {
    lockedIdent = null;
    return;
  }
  const c = pickCandidate(alternates(), headOffset());
  if (c) lockedIdent = c.waypoint.ident;
});

$('btnMode').addEventListener('click', () => {
  mode = mode === 'HANDHELD' ? 'MOUNTED' : 'HANDHELD';
  $('btnMode').textContent = mode;
});
$('btnView').addEventListener('click', () => {
  view = view === 'TARGET' ? 'PFD' : view === 'PFD' ? 'MINIMAL' : 'TARGET';
  $('btnView').textContent = view;
  lockedIdent = null;
});
$('btnZero').addEventListener('click', () => {
  beta0 = beta; // capture "level" reference for mounted attitude
  gamma0 = gamma;
});
$('btnNight').addEventListener('click', () => {
  day = !day;
  $('btnNight').textContent = day ? 'DAY' : 'NIGHT';
});

$('startBtn').addEventListener('click', async () => {
  await requestPermissions();
  $('start').classList.add('hidden');
  $('bar').classList.remove('hidden');
  $('hint').classList.remove('hidden');
  requestAnimationFrame(frame);
});
