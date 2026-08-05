/**
 * GlassesBridge implementation that renders to an HTML canvas, faithfully
 * emulating the G2's 576x288 monochrome-green display. Lets the exact same app
 * run in a browser with no hardware. Gestures are injected by the sim harness
 * (keyboard); device state can be injected too.
 *
 * Fidelity notes:
 * - Single fixed font size (the SDK exposes no font-size control), so the HUD
 *   is designed as a text strip, not scaled digits.
 * - Anti-aliased green text naturally produces multiple brightness levels,
 *   matching the panel's 16-level grayscale.
 */
import { SCREEN_W, SCREEN_H } from './bridge.js';
import type {
  GlassesBridge,
  HudContainer,
  Gesture,
  DeviceState,
} from './bridge.js';

/** Approximate on-glasses default font size, in display pixels. */
export const SIM_FONT_PX = 22;
const GREEN = '#4dff7a';

export class SimBridge implements GlassesBridge {
  private readonly ctx: CanvasRenderingContext2D;
  private containers = new Map<number, HudContainer>();
  private gestureListeners = new Set<(g: Gesture) => void>();
  private deviceListeners = new Set<(s: DeviceState) => void>();
  private device: DeviceState = { connected: true, wearing: true, batteryLevel: 100, charging: false };

  constructor(canvas: HTMLCanvasElement, scale = 2) {
    canvas.width = SCREEN_W * scale;
    canvas.height = SCREEN_H * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
    this.ctx.scale(scale, scale);
    this.render();
  }

  async createPage(containers: HudContainer[]): Promise<void> {
    await this.flash();
    this.setContainers(containers);
  }

  async rebuildPage(containers: HudContainer[]): Promise<void> {
    await this.flash();
    this.setContainers(containers);
  }

  async updateText(id: number, text: string): Promise<void> {
    const c = this.containers.get(id);
    if (c) {
      c.text = text;
      this.render();
    }
  }

  async shutdown(): Promise<void> {
    this.containers.clear();
    this.render();
  }

  onGesture(cb: (g: Gesture) => void): () => void {
    this.gestureListeners.add(cb);
    return () => this.gestureListeners.delete(cb);
  }

  onDeviceState(cb: (s: DeviceState) => void): () => void {
    this.deviceListeners.add(cb);
    cb(this.device); // emit current state immediately
    return () => this.deviceListeners.delete(cb);
  }

  // --- sim-only injection points ---

  /** Deliver a gesture as if the pilot touched the temple / ring. */
  injectGesture(g: Gesture): void {
    for (const l of this.gestureListeners) l(g);
  }

  /** Update the simulated device state (e.g. a slowly draining battery). */
  setDeviceState(partial: Partial<DeviceState>): void {
    this.device = { ...this.device, ...partial };
    for (const l of this.deviceListeners) l(this.device);
  }

  // --- rendering ---

  private setContainers(containers: HudContainer[]): void {
    this.containers = new Map(containers.map((c) => [c.id, { ...c }]));
    this.render();
  }

  private async flash(): Promise<void> {
    // Emulate the hardware page-build flash: brief blank frame.
    this.ctx.fillStyle = '#001b0a';
    this.ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    await new Promise((r) => setTimeout(r, 60));
  }

  private render(): void {
    const ctx = this.ctx;
    // Phosphor background.
    ctx.fillStyle = '#020d06';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

    // Faint frame to delimit the field of view.
    ctx.strokeStyle = 'rgba(77,255,122,0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, SCREEN_W - 1, SCREEN_H - 1);

    ctx.font = `${SIM_FONT_PX}px "DejaVu Sans Mono", "Menlo", monospace`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = GREEN;
    ctx.shadowColor = GREEN;
    ctx.shadowBlur = 6;
    for (const c of this.containers.values()) {
      // Vertically centre the single line of text within the container box.
      const y = c.y + Math.max(0, (c.h - SIM_FONT_PX) / 2);
      ctx.fillText(c.text, c.x, y);
    }
    ctx.shadowBlur = 0;
  }
}
