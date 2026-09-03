/**
 * Renders HUD views to a GlassesBridge with minimal traffic.
 *
 * Within a view, only containers whose text changed are pushed via
 * updateText() (no-flicker partial update). Switching views — or any change to
 * the set of container ids — triggers a full rebuildPage() (which flashes), so
 * partial updates are never sent against a stale layout.
 */
import type { GlassesBridge, HudContainer } from '../bridge/bridge.js';
import { buildView } from './views.js';
import type { HudView, HudState } from './model.js';

export class HudRenderer {
  private currentView: HudView | null = null;
  private lastText = new Map<number, string>();
  /** Serialises sends: the SDK requires waiting for one send before the next. */
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly bridge: GlassesBridge) {}

  /** Build the given view from state and reconcile it onto the display. */
  render(view: HudView, state: HudState): void {
    const containers = buildView(view, state);
    // Uniform text brightness from settings — stamped on every container so a
    // (re)build carries the current textColor. A brightness change invalidates
    // the cache (see controller), forcing the rebuild that applies it.
    for (const c of containers) c.brightness = state.config.brightness;
    const idsChanged = !sameIds(containers, this.lastText);

    if (view !== this.currentView || this.currentView === null || idsChanged) {
      this.currentView = view;
      this.cache(containers);
      const isFirst = this.lastBuiltOnce === false;
      this.lastBuiltOnce = true;
      this.enqueue(() =>
        isFirst ? this.bridge.createPage(containers) : this.bridge.rebuildPage(containers),
      );
      return;
    }

    // Same view + same ids: diff and update only what changed.
    for (const c of containers) {
      if (this.lastText.get(c.id) !== c.text) {
        this.lastText.set(c.id, c.text);
        const id = c.id;
        const text = c.text;
        this.enqueue(() => this.bridge.updateText(id, text));
      }
    }
  }

  /** Force a full rebuild on the next render (e.g. after a manual view reset). */
  invalidate(): void {
    this.currentView = null;
    this.lastText.clear();
  }

  private lastBuiltOnce = false;

  private cache(containers: HudContainer[]): void {
    this.lastText.clear();
    for (const c of containers) this.lastText.set(c.id, c.text);
  }

  private enqueue(op: () => Promise<void>): void {
    this.queue = this.queue.then(op).catch((err) => {
      // Never let one failed send wedge the queue.
      console.error('[HUD] send failed:', err);
    });
  }
}

function sameIds(containers: HudContainer[], cache: Map<number, string>): boolean {
  if (containers.length !== cache.size) return false;
  for (const c of containers) if (!cache.has(c.id)) return false;
  return true;
}
