/**
 * The `GlassesBridge` seam. The whole app is written against this interface so
 * it runs unchanged on real G2 hardware (EvenSdkBridge) or in the browser
 * simulator (SimBridge). It intentionally hides the SDK's container/protobuf
 * details behind a tiny display + input surface.
 */

/** G2 display size, per lens, in pixels. */
export const SCREEN_W = 576;
export const SCREEN_H = 288;

/** Max simultaneously-addressable containers on a page (SDK: 1..12). */
export const MAX_CONTAINERS = 12;

/** A single text field placed absolutely on the display. */
export interface HudContainer {
  /** Stable numeric id (1..12), used for partial updates. */
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
}

// The gestures the firmware relays. `press`/`doublePress` are treated as one
// "activate" by the controller (single tap isn't delivered reliably on current
// hardware). `longPress`/`longPressRelease` are the "tap then long-press and
// release" pair (SDK event codes 9/10) — held-down begins, lift ends — used for
// hold-to-reveal declutter.
export type GestureType =
  | 'press'
  | 'doublePress'
  | 'swipeUp'
  | 'swipeDown'
  | 'longPress'
  | 'longPressRelease';
export type GestureSource = 'glassesL' | 'glassesR' | 'ring' | 'unknown';

export interface Gesture {
  type: GestureType;
  source: GestureSource;
}

export interface DeviceState {
  connected: boolean;
  wearing?: boolean;
  batteryLevel?: number;
  charging?: boolean;
}

export interface GlassesBridge {
  /** Initial page build. Causes a display flash on hardware. */
  createPage(containers: HudContainer[]): Promise<void>;
  /** Full page rebuild (e.g. switching views). Also flashes. */
  rebuildPage(containers: HudContainer[]): Promise<void>;
  /** Partial text update of one container. No flicker on hardware. */
  updateText(id: number, text: string): Promise<void>;
  /** Tear down the page and exit. */
  shutdown(): Promise<void>;

  /** Subscribe to touchpad/ring gestures. Returns an unsubscribe function. */
  onGesture(cb: (g: Gesture) => void): () => void;
  /** Subscribe to device status (battery, wearing, connection). */
  onDeviceState(cb: (s: DeviceState) => void): () => void;
}
