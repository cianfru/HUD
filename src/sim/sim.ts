/**
 * Browser simulator harness. Runs the real HudController against the SimBridge
 * (canvas display) and a SimulatedPositionSource (flies the demo route), so the
 * HUD can be seen and driven with the keyboard — no glasses required.
 */
import { SimBridge } from '../bridge/sim-bridge.js';
import { SimulatedPositionSource } from '../data/position/sim-source.js';
import { HudController } from '../app/controller.js';
import { FlightPlan } from '../core/flightplan.js';
import { parseRoute } from '../data/route-parser.js';
import { DEMO_ROUTE_STRING } from '../data/navdata.js';
import type { Gesture } from '../bridge/bridge.js';

const canvas = document.getElementById('hud') as HTMLCanvasElement;
const routeEl = document.getElementById('route');

const { waypoints } = parseRoute(DEMO_ROUTE_STRING);
if (routeEl) routeEl.textContent = `${waypoints[0]?.ident} → ${waypoints[waypoints.length - 1]?.ident}`;

const bridge = new SimBridge(canvas, 2);
const source = new SimulatedPositionSource(waypoints, {
  cruiseKt: 458,
  cruiseAltFt: 37000,
  updateMs: 1000,
  timeScale: 25,
  wanderNm: 0.7,
});

const controller = new HudController(bridge, source, new FlightPlan(waypoints), { tickMs: 1000 });
controller.start();

// Simulate a slowly draining battery so the status field is alive.
let battery = 96;
setInterval(() => {
  battery = Math.max(0, battery - 1);
  bridge.setDeviceState({ batteryLevel: battery });
}, 15000);

// Keyboard -> gesture / control mapping.
const gesture = (type: Gesture['type']): Gesture => ({ type, source: 'ring' });

window.addEventListener('keydown', (e) => {
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      bridge.injectGesture(gesture('swipeDown'));
      break;
    case 'ArrowUp':
      e.preventDefault();
      bridge.injectGesture(gesture('swipeUp'));
      break;
    case 'Enter':
    case ' ':
      e.preventDefault();
      bridge.injectGesture(gesture('press'));
      break;
    case 'd':
    case 'D':
      bridge.injectGesture(gesture('doublePress'));
      break;
    case '[':
      source.setTimeScale(source.getTimeScale() / 1.5);
      break;
    case ']':
      source.setTimeScale(source.getTimeScale() * 1.5);
      break;
  }
});
