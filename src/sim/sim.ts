/**
 * Browser simulator for the PFD-style HUD, with a DEVICE-HONEST mode so the
 * preview matches what the G2 panel can actually emit.
 *
 * Rendering pipeline:
 *   1. draw the HUD into an offscreen canvas at NATIVE 576x288
 *   2. (honest) quantise to 16 green levels, no glow
 *   3. composite to the visible canvas — over a dark panel, or ADDITIVELY over a
 *      bright daytime scene to emulate the see-through display (black =
 *      transparent; only lit green pixels add light, faint marks wash out)
 *
 * Keys: H device-honest · B sky background · M minimal design · N night/day ·
 *       T cruise/divert · [ ] flight speed.
 */
import { SimulatedPositionSource } from '../data/position/sim-source.js';
import { FlightPlan } from '../core/flightplan.js';
import { parseRoute } from '../data/route-parser.js';
import { AIRPORTS, DEMO_ROUTE_STRING, DEMO_ALTERNATES } from '../data/navdata.js';
import { computeAlternates } from '../core/diversion.js';
import type { AlternateCandidate } from '../core/diversion.js';
import { drawPfd, drawPfdMinimal, NIGHT, DAY, PFD_W, PFD_H } from '../hud/pfd.js';
import type { PfdState } from '../hud/pfd.js';
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

let fix: Position | null = null;
let day = false;
let honest = false;
let sky = false;
let minimal = false;
let mode: PfdState['mode'] = 'CRUISE';

source.start((f) => {
  fix = f;
  plan.autoSequence(f);
});

function currentState(): PfdState {
  const gsKt = fix?.speedMps != null ? fix.speedMps * MPS_TO_KNOTS : null;
  const altFt = fix?.altitudeM != null ? fix.altitudeM * METERS_TO_FEET : null;
  const track = fix?.trackDeg ?? null;
  const alternates = fix ? computeAlternates(fix, track, gsKt, candidates, { maxRangeNm: 200 }) : [];
  return { gsKt, altFt, trackDeg: track, clock: formatUtcClock(new Date()) + 'Z', mode, alternates };
}

/** A bright daytime scene to stress-test see-through legibility. */
function drawScene(): void {
  const w = display.width;
  const h = display.height;
  const horizon = h * 0.62;
  const sky2 = dctx.createLinearGradient(0, 0, 0, horizon);
  sky2.addColorStop(0, '#8fb4d8');
  sky2.addColorStop(1, '#e6edf1'); // hazy bright near horizon
  dctx.fillStyle = sky2;
  dctx.fillRect(0, 0, w, horizon);
  // Sun glare.
  const glare = dctx.createRadialGradient(w * 0.72, horizon * 0.5, 0, w * 0.72, horizon * 0.5, h * 0.5);
  glare.addColorStop(0, 'rgba(255,255,255,0.9)');
  glare.addColorStop(1, 'rgba(255,255,255,0)');
  dctx.fillStyle = glare;
  dctx.fillRect(0, 0, w, horizon);
  // Terrain.
  const ground = dctx.createLinearGradient(0, horizon, 0, h);
  ground.addColorStop(0, '#c3b287');
  ground.addColorStop(1, '#6f6144');
  dctx.fillStyle = ground;
  dctx.fillRect(0, horizon, w, h - horizon);
  // Glareshield.
  dctx.fillStyle = '#1b1d1f';
  dctx.fillRect(0, h * 0.86, w, h * 0.14);
}

function frame(): void {
  const st = currentState();
  const basePal = day ? DAY : NIGHT;
  const pal = honest ? { ...basePal, glow: 0 } : basePal;

  if (minimal) drawPfdMinimal(octx, st, pal);
  else drawPfd(octx, st, pal);

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
  dctx.imageSmoothingEnabled = !honest; // native pixels in honest mode
  dctx.globalCompositeOperation = honest || sky ? 'lighter' : 'source-over';
  dctx.drawImage(off, 0, 0, PFD_W, PFD_H, 0, 0, display.width, display.height);
  dctx.globalCompositeOperation = 'source-over';

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function refreshStatus(): void {
  if (statusEl) {
    statusEl.textContent =
      `${minimal ? 'MINIMAL' : 'FULL'} · ${honest ? 'DEVICE-HONEST 576×288/16-level' : 'idealised'} · ` +
      `${sky ? 'over sky' : 'dark'} · ${day ? 'day' : 'night'}`;
  }
}
refreshStatus();

window.addEventListener('keydown', (e) => {
  switch (e.key.toLowerCase()) {
    case 'h':
      honest = !honest;
      break;
    case 'b':
      sky = !sky;
      break;
    case 'm':
      minimal = !minimal;
      break;
    case 'n':
      day = !day;
      display.parentElement?.classList.toggle('day', day);
      break;
    case 't':
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
