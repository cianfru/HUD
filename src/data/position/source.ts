/**
 * A source of aircraft position/velocity fixes. On hardware this is the phone's
 * location service (fed by the Garmin GLO over Bluetooth as an iOS MFi source);
 * in development it is a simulated flight.
 */
import type { Position } from '../../core/types.js';

export type PositionListener = (fix: Position) => void;

export interface PositionSource {
  /** Begin delivering fixes. Returns a function that stops delivery. */
  start(onFix: PositionListener): void;
  /** Stop delivering fixes and release any resources. */
  stop(): void;
}
