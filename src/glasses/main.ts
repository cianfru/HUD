/**
 * On-glasses / official-simulator entry.
 *
 * Unlike the phone MVP (which draws to a canvas), this build renders through the
 * real Even Hub SDK: it emits text containers that the glasses firmware — and
 * the official `@evenrealities/evenhub-simulator` — rasterise to the 576×288
 * display. It flies the demo route with the SIMULATED position source, because
 * the simulator provides no GPS/IMU, so the HUD is alive in the preview.
 *
 * Run it against the official simulator (on a Mac/PC with a display):
 *   npm run dev:glasses            # serves http://localhost:5175
 *   npx @evenrealities/evenhub-simulator http://localhost:5175
 *
 * Touchpad: Up/Down cycle pages (CRUISE · ROUTE · SETTINGS), Click = context
 * action, Double-click = toggle UTC/local clock.
 */
import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
import { EvenSdkBridge } from '../bridge/even-sdk.js';
import { SimulatedPositionSource } from '../data/position/sim-source.js';
import { HudController } from '../app/controller.js';
import { FlightPlan } from '../core/flightplan.js';
import { parseRoute } from '../data/route-parser.js';
import { DEMO_ROUTE_STRING } from '../data/navdata.js';

function status(msg: string): void {
  const el = document.getElementById('status');
  if (el) el.textContent = msg;
  console.log('[glasses]', msg);
}

async function boot(): Promise<void> {
  status('waiting for Even bridge…');
  const sdk = await waitForEvenAppBridge();
  const bridge = new EvenSdkBridge(sdk);

  const { waypoints } = parseRoute(DEMO_ROUTE_STRING);
  const source = new SimulatedPositionSource(waypoints, {
    cruiseKt: 458,
    cruiseAltFt: 37000,
    updateMs: 1000,
    timeScale: 20,
    wanderNm: 0.6,
  });

  const controller = new HudController(bridge, source, new FlightPlan(waypoints), { tickMs: 1000 });
  controller.start();
  status('running — HUD rendered on the glasses display');
}

boot().catch((err) => status(`failed to start: ${String(err)}`));
