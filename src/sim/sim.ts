/**
 * Browser simulator. Default view is TARGET ACQUISITION: move the mouse over the
 * display to slew your head across the world (±180°), park the reticle on an
 * airport, and press Enter/Space (the "ring click") to lock it and open its
 * detail card. Also renders the PFD and minimal views for comparison, and a
 * DEVICE-HONEST mode (native 576×288, 16 green levels, additive over a bright
 * sky) so the preview matches what the panel can actually emit.
 *
 * Keys: mouse/←/→ head · Enter/Space ring-lock · V view · H device-honest ·
 *       B sky · M (min↔pfd) · N night/day · T cruise/divert · [ ] flight speed.
 */
import { SimulatedPositionSource } from '../data/position/sim-source.js';
import { FlightPlan } from '../core/flightplan.js';
import { parseRoute } from '../data/route-parser.js';
import { AIRPORTS, DEMO_ROUTE_STRING, DEMO_ALTERNATES, DEMO_AIRPORT_DETAIL } from '../data/navdata.js';
import { computeAlternates } from '../core/diversion.js';
import type { AlternateCandidate, Alternate } from '../core/diversion.js';
import { drawPfd, drawPfdMinimal, NIGHT, DAY, PFD_W, PFD_H } from '../hud/pfd.js';
import type { PfdState } from '../hud/pfd.js';
import { drawTargetView, pickCandidate } from '../hud/target.js';
import type { TargetViewState, LockedTarget } from '../hud/target.js';
import { coordinatedBankDeg } from '../core/attitude.js';
import type { Attitude } from '../core/attitude.js';
import { quantizeToDeviceGreen } from '../hud/device.js';
import { MPS_TO_KNOTS, METERS_TO_FEET } from '../core/units.js';
import { formatUtcClock } from '../core/time.js';
import type { Position } from '../core/types.js';

const display = document.getElementById('hud') as HTMLCanvasElement;
const routeEl = document.getElementById('route');
const modeEl = document.getElementById('mode');
const statusEl = document.getElementById('status');

const VIEW_SCALE = 2;
display.width = PFD_W * VIEW_SCALE;
display.height = PFD_H * VIEW_SCALE;
const dctx = display.getContext('2d')!;

const off = document.createElement('canvas');
off.width = PFD_W;
off.height = PFD_H;
const octx = off.getContext('2d')!;

const { waypoints } = parseRoute(DEMO_ROUTE_STRING);
if (routeEl) routeEl.textContent = `${waypoints[0]?.ident} → ${waypoints[waypoints.length - 1]?.ident}`;
const plan = new FlightPlan(waypoints);

const candidates: AlternateCandidate[] = DEMO_ALTERNATES.map((a) => ({
  waypoint: AIRPORTS[a.ident]!,
  suitable: a.suitable,
})).filter((c) => c.waypoint);

const source = new SimulatedPositionSource(waypoints, {
  cruiseKt: 458,
  cruiseAltFt: 37000,
  updateMs: 1000,
  timeScale: 25,
  wanderNm: 0.8,
});

type View = 'TARGET' | 'PFD' | 'MINIMAL';
const VIEWS: View[] = ['TARGET', 'PFD', 'MINIMAL'];

let fix: Position | null = null;
let day = false;
let honest = false;
let sky = false;
let view: View = 'TARGET';
let mode: PfdState['mode'] = 'CRUISE';
let headOffsetDeg = 0; // where the head is looking, relative to track
let headRollDeg = 0; // head tilt relative to the airframe
let attitudeOn = true;
let lockedIdent: string | null = null;

const START = performance.now();
let prevTrack: number | null = null;
let prevTrackT = START;

source.start((f) => {
  fix = f;
  plan.autoSequence(f);
});

/**
 * Simulated aircraft attitude, standing in for the mounted-phone AHRS: a gentle
 * demo roll/pitch oscillation plus the coordinated-turn bank implied by the
 * current GPS turn rate.
 */
function simAttitude(): Attitude {
  const t = (performance.now() - START) / 1000;
  let turnBank = 0;
  const track = fix?.trackDeg ?? null;
  const gsKt = fix?.speedMps != null ? fix.speedMps * MPS_TO_KNOTS : 0;
  if (track != null && prevTrack != null) {
    const dt = (performance.now() - prevTrackT) / 1000;
    if (dt > 0.05) {
      let d = track - prevTrack;
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      turnBank = coordinatedBankDeg(gsKt, d / dt);
    }
  }
  prevTrack = track;
  prevTrackT = performance.now();
  return {
    rollDeg: 11 * Math.sin(t * 0.1) + Math.max(-25, Math.min(25, turnBank)),
    pitchDeg: 2.2 * Math.sin(t * 0.14),
  };
}

function alternates(): Alternate[] {
  const gsKt = fix?.speedMps != null ? fix.speedMps * MPS_TO_KNOTS : null;
  const track = fix?.trackDeg ?? null;
  return fix ? computeAlternates(fix, track, gsKt, candidates, { maxRangeNm: 250 }) : [];
}

function pfdState(): PfdState {
  const gsKt = fix?.speedMps != null ? fix.speedMps * MPS_TO_KNOTS : null;
  const altFt = fix?.altitudeM != null ? fix.altitudeM * METERS_TO_FEET : null;
  return {
    gsKt,
    altFt,
    trackDeg: fix?.trackDeg ?? null,
    clock: formatUtcClock(new Date()) + 'Z',
    mode,
    alternates: alternates(),
  };
}

function lockedTarget(alts: Alternate[]): LockedTarget | null {
  if (!lockedIdent) return null;
  const a = alts.find((x) => x.waypoint.ident === lockedIdent);
  if (!a) return null;
  const detail = DEMO_AIRPORT_DETAIL[a.waypoint.ident];
  return {
    ident: a.waypoint.ident,
    name: a.waypoint.name ?? a.waypoint.ident,
    bearingDeg: a.bearingDeg,
    distanceNm: a.distanceNm,
    eteSec: a.eteSec,
    suitable: a.suitable,
    rwy: detail?.rwy ?? '— (demo)',
    metar: detail?.metar ?? 'uplink pending (demo)',
  };
}

function targetState(): TargetViewState {
  const gsKt = fix?.speedMps != null ? fix.speedMps * MPS_TO_KNOTS : null;
  const altFt = fix?.altitudeM != null ? fix.altitudeM * METERS_TO_FEET : null;
  const alts = alternates();
  return {
    alternates: alts,
    gsKt,
    altFt,
    trackDeg: fix?.trackDeg ?? null,
    headOffsetDeg,
    locked: lockedTarget(alts),
    attitude: attitudeOn ? simAttitude() : null,
    headRollDeg,
  };
}

/** A bright daytime scene to stress-test see-through legibility. */
function drawScene(): void {
  const w = display.width;
  const h = display.height;
  const horizon = h * 0.62;
  const grad = dctx.createLinearGradient(0, 0, 0, horizon);
  grad.addColorStop(0, '#8fb4d8');
  grad.addColorStop(1, '#e6edf1');
  dctx.fillStyle = grad;
  dctx.fillRect(0, 0, w, horizon);
  const glare = dctx.createRadialGradient(w * 0.72, horizon * 0.5, 0, w * 0.72, horizon * 0.5, h * 0.5);
  glare.addColorStop(0, 'rgba(255,255,255,0.9)');
  glare.addColorStop(1, 'rgba(255,255,255,0)');
  dctx.fillStyle = glare;
  dctx.fillRect(0, 0, w, horizon);
  const ground = dctx.createLinearGradient(0, horizon, 0, h);
  ground.addColorStop(0, '#c3b287');
  ground.addColorStop(1, '#6f6144');
  dctx.fillStyle = ground;
  dctx.fillRect(0, horizon, w, h - horizon);
  dctx.fillStyle = '#1b1d1f';
  dctx.fillRect(0, h * 0.86, w, h * 0.14);
}

function frame(): void {
  const basePal = day ? DAY : NIGHT;
  const pal = honest ? { ...basePal, glow: 0 } : basePal;

  if (view === 'TARGET') drawTargetView(octx, targetState(), pal);
  else if (view === 'MINIMAL') drawPfdMinimal(octx, pfdState(), pal);
  else drawPfd(octx, pfdState(), pal);

  if (honest) {
    const img = octx.getImageData(0, 0, PFD_W, PFD_H);
    quantizeToDeviceGreen(img.data);
    octx.putImageData(img, 0, 0);
  }

  dctx.setTransform(1, 0, 0, 1, 0, 0);
  dctx.globalCompositeOperation = 'source-over';
  if (sky) drawScene();
  else {
    dctx.fillStyle = honest ? '#000000' : '#05100b';
    dctx.fillRect(0, 0, display.width, display.height);
  }
  dctx.imageSmoothingEnabled = !honest;
  dctx.globalCompositeOperation = honest || sky ? 'lighter' : 'source-over';
  dctx.drawImage(off, 0, 0, PFD_W, PFD_H, 0, 0, display.width, display.height);
  dctx.globalCompositeOperation = 'source-over';

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function refreshStatus(): void {
  if (statusEl) {
    statusEl.textContent =
      `${view}${view === 'PFD' || view === 'MINIMAL' ? ' (' + mode + ')' : ''} · ` +
      `${honest ? 'device-honest' : 'idealised'} · ${sky ? 'over sky' : 'dark'} · ${day ? 'day' : 'night'}` +
      (view === 'TARGET' ? (lockedIdent ? ` · LOCKED ${lockedIdent}` : ' · sweep & lock') : '');
  }
}
refreshStatus();

// Head slew via mouse over the display (±180°).
display.addEventListener('mousemove', (e) => {
  const rect = display.getBoundingClientRect();
  const frac = (e.clientX - rect.left) / rect.width;
  headOffsetDeg = Math.max(-180, Math.min(180, (frac - 0.5) * 360));
});

function ringClick(): void {
  if (view !== 'TARGET') return;
  if (lockedIdent) {
    lockedIdent = null; // release
    return;
  }
  const cand = pickCandidate(alternates(), headOffsetDeg);
  if (cand) lockedIdent = cand.waypoint.ident;
}

window.addEventListener('keydown', (e) => {
  switch (e.key) {
    case 'Enter':
    case ' ':
      e.preventDefault();
      ringClick();
      break;
    case 'ArrowLeft':
      headOffsetDeg = Math.max(-180, headOffsetDeg - 5);
      break;
    case 'ArrowRight':
      headOffsetDeg = Math.min(180, headOffsetDeg + 5);
      break;
    case 'q':
    case 'Q':
      headRollDeg = Math.max(-30, headRollDeg - 3); // tilt head left
      break;
    case 'e':
    case 'E':
      headRollDeg = Math.min(30, headRollDeg + 3); // tilt head right
      break;
    case 'a':
    case 'A':
      attitudeOn = !attitudeOn;
      break;
    case 'v':
    case 'V':
      view = VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length]!;
      lockedIdent = null;
      break;
    case 'h':
    case 'H':
      honest = !honest;
      break;
    case 'b':
    case 'B':
      sky = !sky;
      break;
    case 'm':
    case 'M':
      view = view === 'MINIMAL' ? 'PFD' : 'MINIMAL';
      break;
    case 'n':
    case 'N':
      day = !day;
      display.parentElement?.classList.toggle('day', day);
      break;
    case 't':
    case 'T':
      mode = mode === 'CRUISE' ? 'DIVERT' : 'CRUISE';
      if (modeEl) modeEl.textContent = mode;
      break;
    case '[':
      source.setTimeScale(source.getTimeScale() / 1.5);
      break;
    case ']':
      source.setTimeScale(source.getTimeScale() * 1.5);
      break;
  }
  refreshStatus();
});
