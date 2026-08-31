/**
 * GlassesBridge implementation backed by @evenrealities/even_hub_sdk.
 *
 * Maps our flat HudContainer model onto the SDK's container/upgrade protobufs
 * and normalises raw EvenHub events into clean Gestures.
 */
import {
  CreateStartUpPageContainer,
  RebuildPageContainer,
  TextContainerProperty,
  TextContainerUpgrade,
  OsEventTypeList,
  EventSourceType,
} from '@evenrealities/even_hub_sdk';
import type { EvenAppBridge, EvenHubEvent, DeviceStatus } from '@evenrealities/even_hub_sdk';
import type {
  GlassesBridge,
  HudContainer,
  Gesture,
  GestureType,
  GestureSource,
  DeviceState,
} from './bridge.js';

/** Max text containers per page (firmware/simulator limit). */
const MAX_TEXT_CONTAINERS = 8;

export class EvenSdkBridge implements GlassesBridge {
  constructor(private readonly bridge: EvenAppBridge) {}

  async createPage(containers: HudContainer[]): Promise<void> {
    const textObject = this.toTextObjects(containers);
    const page = new CreateStartUpPageContainer({
      containerTotalNum: textObject.length,
      textObject,
    });
    await this.bridge.createStartUpPageContainer(page);
  }

  async rebuildPage(containers: HudContainer[]): Promise<void> {
    const textObject = this.toTextObjects(containers);
    const page = new RebuildPageContainer({
      containerTotalNum: textObject.length,
      textObject,
    });
    await this.bridge.rebuildPageContainer(page);
  }

  /**
   * Map to SDK text containers, capped at the firmware limit, with the first
   * container marked as the event-capturer — the firmware/simulator only route
   * touchpad input to the app when a page has an event-capturing container, and
   * a dedicated extra container would blow the 8-container budget.
   */
  private toTextObjects(containers: HudContainer[]): TextContainerProperty[] {
    return containers.slice(0, MAX_TEXT_CONTAINERS).map((c, i) => {
      const t = toTextContainer(c);
      if (i === 0) t.isEventCapture = 1;
      return t;
    });
  }

  async updateText(id: number, text: string): Promise<void> {
    const upgrade = new TextContainerUpgrade({
      containerID: id,
      contentOffset: 0,
      contentLength: text.length,
      content: text,
    });
    await this.bridge.textContainerUpgrade(upgrade);
  }

  async shutdown(): Promise<void> {
    await this.bridge.shutDownPageContainer();
  }

  onGesture(cb: (g: Gesture) => void): () => void {
    return this.bridge.onEvenHubEvent((event: EvenHubEvent) => {
      const g = eventToGesture(event);
      if (g) cb(g);
    });
  }

  onDeviceState(cb: (s: DeviceState) => void): () => void {
    return this.bridge.onDeviceStatusChanged((status: DeviceStatus) => {
      cb({
        connected: status.isConnected(),
        wearing: status.isWearing,
        batteryLevel: status.batteryLevel,
        charging: status.isCharging,
      });
    });
  }
}

function toTextContainer(c: HudContainer): TextContainerProperty {
  return new TextContainerProperty({
    containerID: c.id,
    xPosition: c.x,
    yPosition: c.y,
    width: c.w,
    height: c.h,
    borderWidth: 0,
    content: c.text,
  });
}

/** Normalise a raw EvenHub event into a Gesture, or null if it isn't one. */
export function eventToGesture(event: EvenHubEvent): Gesture | null {
  const sys = event.sysEvent;
  const text = event.textEvent;
  const list = event.listEvent;
  const eventType = sys?.eventType ?? text?.eventType ?? list?.eventType;
  const type = osEventToGestureType(eventType);
  if (!type) return null;
  return { type, source: sourceOf(sys?.eventSource) };
}

// Codes 9/10 (long-press begin / release) exist on the firmware and SDK >= 0.0.14
// but not in the 0.0.13 type enum, so match on the raw numeric value.
const LONG_PRESS = 9;
const LONG_PRESS_RELEASE = 10;

function osEventToGestureType(e: OsEventTypeList | undefined): GestureType | null {
  switch (e as number | undefined) {
    case OsEventTypeList.CLICK_EVENT:
      return 'press';
    case OsEventTypeList.DOUBLE_CLICK_EVENT:
      return 'doublePress';
    case OsEventTypeList.SCROLL_TOP_EVENT:
      return 'swipeUp';
    case OsEventTypeList.SCROLL_BOTTOM_EVENT:
      return 'swipeDown';
    case LONG_PRESS:
      return 'longPress';
    case LONG_PRESS_RELEASE:
      return 'longPressRelease';
    default:
      return null;
  }
}

function sourceOf(s: EventSourceType | undefined): GestureSource {
  switch (s) {
    case EventSourceType.TOUCH_EVENT_FROM_GLASSES_L:
      return 'glassesL';
    case EventSourceType.TOUCH_EVENT_FROM_GLASSES_R:
      return 'glassesR';
    case EventSourceType.TOUCH_EVENT_FROM_RING:
      return 'ring';
    default:
      return 'unknown';
  }
}
