/**
 * The immutable snapshot the HUD views render from, and the set of views.
 */
import type { Position, Guidance } from '../core/types.js';
import type { FlightPlan } from '../core/flightplan.js';
import type { DeviceState } from '../bridge/bridge.js';

export type HudView = 'CRUISE' | 'ROUTE' | 'SETTINGS';

/** Views in swipe order. */
export const VIEW_ORDER: HudView[] = ['CRUISE', 'ROUTE', 'SETTINGS'];

export interface HudConfig {
  clock: 'utc' | 'local';
  autoSequence: boolean;
}

export interface HudState {
  now: Date;
  position: Position | null;
  guidance: Guidance | null;
  plan: FlightPlan;
  device: DeviceState;
  config: HudConfig;
  /** Epoch ms when the flight timer started. */
  flightStartMs: number;
}
