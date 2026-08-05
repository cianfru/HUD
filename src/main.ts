/**
 * On-device entry point. Loaded by the Even iPhone app's WebView on real G2
 * hardware. Waits for the SDK bridge, wires the real GPS (Garmin GLO via the
 * phone's location service) to the HUD, and starts the controller.
 *
 * The in-browser development experience lives in `src/sim/` and does NOT import
 * this file, so the simulator bundle never pulls in the SDK.
 */
import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
import { EvenSdkBridge } from './bridge/even-sdk.js';
import { SdkPositionSource } from './data/position/sdk-source.js';
import { HudController } from './app/controller.js';
import { FlightPlan } from './core/flightplan.js';
import { parseRoute } from './data/route-parser.js';
import { DEMO_ROUTE_STRING } from './data/navdata.js';

async function boot(): Promise<void> {
  const sdk = await waitForEvenAppBridge();
  const bridge = new EvenSdkBridge(sdk);
  const positionSource = new SdkPositionSource(sdk);

  const { waypoints } = parseRoute(loadRoute());
  const plan = new FlightPlan(waypoints);

  const controller = new HudController(bridge, positionSource, plan);
  controller.start();
}

/**
 * The active route. For now this is the demo route; a later iteration will let
 * the pilot enter/paste a route on the phone and persist it via the SDK's
 * local-storage API (SetLocalStorage / GetLocalStorage).
 */
function loadRoute(): string {
  return DEMO_ROUTE_STRING;
}

boot().catch((err) => console.error('[HUD] failed to start:', err));
