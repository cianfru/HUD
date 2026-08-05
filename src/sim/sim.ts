/**
 * Browser simulator for the PFD-style HUD. Flies the demo route and renders the
 * PFD (speed left, GPS altitude right, track tape bottom, track-up diversion
 * plan) directly to a canvas that emulates the 576x288 monochrome-green G2
 * display — no hardware required.
 */
import { SimulatedPositionSource } from '../data/position/sim-source.js';
import { FlightPlan } from '../core/flightplan.js';
import { parseRoute } from '../data/route-parser.js';
import { AIRPORTS, DEMO_ROUTE_STRING, DEMO_ALTERNATES } from '../data/navdata.js';
import { computeAlternates } from '../core/diversion.js';
import type { AlternateCandidate } from '../core/diversion.js';
import { drawPfd, NIGHT, DAY, PFD_W, PFD_H } from '../hud/pfd.js';
import type { PfdState } from '../hud/pfd.js';
import { MPS_TO_KNOTS, METERS_TO_FEET } from '../core/units.js';
import { formatUtcClock } from '../core/time.js';
import type { Position } from '../core/types.js';

const canvas = document.getElementById('hud') as HTMLCanvasElement;
const routeEl = document.getElementById('route');
const modeEl = document.getElementById('mode');

const SCALE = 2;
canvas.width = PFD_W * SCALE;
canvas.height = PFD_H * SCALE;
const ctx = canvas.getContext('2d')!;
ctx.scale(SCALE, SCALE);

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
let mode: PfdState['mode'] = 'CRUISE';

source.start((f) => {
  fix = f;
  if (plan.autoSequence(f)) {
    /* sequenced */
  }
});

function currentState(): PfdState {
  const gsKt = fix?.speedMps != null ? fix.speedMps * MPS_TO_KNOTS : null;
  const altFt = fix?.altitudeM != null ? fix.altitudeM * METERS_TO_FEET : null;
  const track = fix?.trackDeg ?? null;
  const alternates = fix ? computeAlternates(fix, track, gsKt, candidates, { maxRangeNm: 200 }) : [];
  return {
    gsKt,
    altFt,
    trackDeg: track,
    clock: formatUtcClock(new Date()) + 'Z',
    mode,
    alternates,
  };
}

function frame(): void {
  drawPfd(ctx, currentState(), day ? DAY : NIGHT);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Keyboard controls.
window.addEventListener('keydown', (e) => {
  switch (e.key) {
    case 'n':
    case 'N':
      day = !day;
      canvas.parentElement?.classList.toggle('day', day);
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
});
