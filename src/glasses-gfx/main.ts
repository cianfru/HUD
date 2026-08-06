/**
 * Graphical glasses build (stage b): renders the target-acquisition view to an
 * offscreen 576×288 canvas and pushes it to the glasses as image containers via
 * ImageDisplay. Flies the demo route with the simulated position source; since
 * the simulator provides no head IMU, the "look" direction auto-sweeps so the
 * reticle passes over the airports (Up/Down also nudge it, Click locks).
 *
 * Run against the official simulator:
 *   npm run dev:glasses-gfx
 *   npx @evenrealities/evenhub-simulator http://localhost:5178
 */
import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
import { ImageDisplay } from '../bridge/image-display.js';
import { SimulatedPositionSource } from '../data/position/sim-source.js';
import { FlightPlan } from '../core/flightplan.js';
import { parseRoute } from '../data/route-parser.js';
import { AIRPORTS, DEMO_ROUTE_STRING, DEMO_ALTERNATES, DEMO_AIRPORT_DETAIL } from '../data/navdata.js';
import { computeAlternates } from '../core/diversion.js';
import type { AlternateCandidate, Alternate } from '../core/diversion.js';
import { drawTargetView, pickCandidate } from '../hud/target.js';
import type { TargetViewState, LockedTarget } from '../hud/target.js';
import { GRAY } from '../hud/draw.js';
import { MPS_TO_KNOTS, METERS_TO_FEET } from '../core/units.js';
import type { Position } from '../core/types.js';

const canvas = document.createElement('canvas');
canvas.width = ImageDisplay.width;
canvas.height = ImageDisplay.height;
const ctx = canvas.getContext('2d')!;

const { waypoints } = parseRoute(DEMO_ROUTE_STRING);
const plan = new FlightPlan(waypoints);
const candidates: AlternateCandidate[] = DEMO_ALTERNATES.map((a) => ({
  waypoint: AIRPORTS[a.ident]!,
  suitable: a.suitable,
})).filter((c) => c.waypoint);

const source = new SimulatedPositionSource(waypoints, {
  cruiseKt: 458,
  cruiseAltFt: 37000,
  updateMs: 1000,
  timeScale: 20,
  wanderNm: 0.6,
});

let fix: Position | null = null;
let headOffsetDeg = 0;
let headNudge = 0;
let lockedIdent: string | null = null;
const startMs = Date.now();

function alternates(): Alternate[] {
  if (!fix) return [];
  const gsKt = fix.speedMps != null ? fix.speedMps * MPS_TO_KNOTS : null;
  return computeAlternates(fix, fix.trackDeg ?? 0, gsKt, candidates, { maxRangeNm: 250 });
}

function lockedTarget(alts: Alternate[]): LockedTarget | null {
  if (!lockedIdent) return null;
  const a = alts.find((x) => x.waypoint.ident === lockedIdent);
  if (!a) return null;
  const d = DEMO_AIRPORT_DETAIL[a.waypoint.ident];
  return {
    ident: a.waypoint.ident,
    name: a.waypoint.name ?? a.waypoint.ident,
    bearingDeg: a.bearingDeg,
    distanceNm: a.distanceNm,
    eteSec: a.eteSec,
    suitable: a.suitable,
    rwy: d?.rwy ?? '',
    metar: d?.metar ?? 'demo',
  };
}

function state(): TargetViewState {
  const t = (Date.now() - startMs) / 1000;
  // Auto-sweep the look direction so the reticle pans across the fields;
  // freeze it while a target is locked so the detail card stays readable.
  if (!lockedIdent) headOffsetDeg = 55 * Math.sin(t / 6) + headNudge;
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
    attitude: { pitchDeg: 1.5 * Math.sin(t / 7), rollDeg: 8 * Math.sin(t / 9) },
    headRollDeg: 0,
  };
}

async function boot(): Promise<void> {
  const bridge = await waitForEvenAppBridge();
  const display = new ImageDisplay(bridge);
  await display.init();

  source.start((f) => {
    fix = f;
    plan.autoSequence(f);
  });

  display.onGesture((g) => {
    if (g.type === 'press') {
      if (lockedIdent) lockedIdent = null;
      else {
        const c = pickCandidate(alternates(), headOffsetDeg);
        if (c) lockedIdent = c.waypoint.ident;
      }
    } else if (g.type === 'swipeUp') {
      headNudge -= 6;
    } else if (g.type === 'swipeDown') {
      headNudge += 6;
    } else if (g.type === 'doublePress') {
      // Demo affordance: slew to and lock the nearest suitable field (a real
      // build would lock whatever the head IMU has under the reticle).
      const best = alternates().find((a) => a.suitable);
      if (best) {
        lockedIdent = lockedIdent ? null : best.waypoint.ident;
        if (lockedIdent) headOffsetDeg = best.relBearingDeg;
      }
    }
  });

  // Render at a modest rate; ImageDisplay only re-pushes tiles that changed.
  setInterval(() => {
    drawTargetView(ctx, state(), GRAY);
    void display.render(canvas);
  }, 220);

  const el = document.getElementById('status');
  if (el) el.textContent = 'graphical HUD running on the glasses display';
}

boot().catch((e) => console.error('[glasses-gfx] fail', e));
