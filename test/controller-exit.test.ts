import { describe, it, expect, afterEach } from 'vitest';
import { HudController } from '../src/app/controller.js';
import { FlightPlan } from '../src/core/flightplan.js';
import type { GlassesBridge, Gesture, GestureType, HudContainer } from '../src/bridge/bridge.js';
import type { PositionSource } from '../src/data/position/source.js';

/** Records what the controller asks of the glasses. */
class FakeBridge implements GlassesBridge {
  shutdowns: Array<boolean | undefined> = [];
  pages: HudContainer[][] = [];
  private gesture: ((g: Gesture) => void) | null = null;
  async createPage(c: HudContainer[]) {
    this.pages.push(c);
  }
  async rebuildPage(c: HudContainer[]) {
    this.pages.push(c);
  }
  async updateText() {}
  async shutdown(confirm?: boolean) {
    this.shutdowns.push(confirm);
  }
  onGesture(cb: (g: Gesture) => void) {
    this.gesture = cb;
    return () => (this.gesture = null);
  }
  onDeviceState() {
    return () => {};
  }
  send(type: GestureType) {
    this.gesture?.({ type, source: 'glassesR' });
  }
}

const idle: PositionSource = { start() {}, stop() {} };

describe('root-page exit (Even Hub review rule)', () => {
  let ctl: HudController | null = null;
  let clock = 0;
  afterEach(() => ctl?.stop());

  const setup = () => {
    const bridge = new FakeBridge();
    clock = 10_000;
    ctl = new HudController(bridge, idle, new FlightPlan([]), { tickMs: 60_000, now: () => clock });
    ctl.start();
    return bridge;
  };

  it('double-tap on the root page asks the system to exit with confirmation (mode 1)', () => {
    const bridge = setup();
    bridge.send('doublePress');
    expect(bridge.shutdowns).toEqual([true]);
  });

  it('single tap on the root page does not exit', () => {
    const bridge = setup();
    bridge.send('press');
    expect(bridge.shutdowns).toEqual([]);
  });

  it('double-tap on another page does not exit', () => {
    const bridge = setup();
    bridge.send('swipeDown'); // -> ALTERNATES
    bridge.send('doublePress');
    bridge.send('swipeDown'); // -> DEST
    clock += 1000;
    bridge.send('doublePress');
    expect(bridge.shutdowns).toEqual([]);
  });

  it('double-tap after swiping back to the root page exits again', () => {
    const bridge = setup();
    bridge.send('swipeDown');
    bridge.send('swipeUp'); // back to CRUISE
    bridge.send('doublePress');
    expect(bridge.shutdowns).toEqual([true]);
  });
});
