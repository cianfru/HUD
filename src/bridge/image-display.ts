/**
 * Full-screen image display for the glasses, built on the Even Hub SDK.
 *
 * The graphical HUD (target view, PFD, attitude) is free-form, so it can't use
 * text containers — it renders to a canvas that we push as IMAGE containers.
 * Image containers are capped at 288×144, so the 576×288 display is covered by a
 * 2×2 grid of four tiles. The confirmed pixel format is a base64-encoded PNG
 * (the firmware maps its luminance to the 16-level green display). Only tiles
 * that changed since the last frame are re-pushed, to save BLE bandwidth.
 *
 * A tiny invisible text container carries `isEventCapture` so the firmware/
 * simulator route touchpad input to the app.
 */
import {
  CreateStartUpPageContainer,
  ImageContainerProperty,
  TextContainerProperty,
  ImageRawDataUpdate,
} from '@evenrealities/even_hub_sdk';
import type { EvenAppBridge, EvenHubEvent } from '@evenrealities/even_hub_sdk';
import { eventToGesture } from './even-sdk.js';
import type { Gesture } from './bridge.js';

const SCREEN_W = 576;
const SCREEN_H = 288;
const TILE_W = 288;
const TILE_H = 144;

interface Tile {
  id: number;
  sx: number;
  sy: number;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  last: string; // last pushed dataURL, for change detection
}

export class ImageDisplay {
  private readonly tiles: Tile[] = [];
  private ready = false;
  private sending = false;

  constructor(private readonly bridge: EvenAppBridge) {
    let id = 1;
    for (let ty = 0; ty < 2; ty++) {
      for (let tx = 0; tx < 2; tx++) {
        const canvas = document.createElement('canvas');
        canvas.width = TILE_W;
        canvas.height = TILE_H;
        this.tiles.push({
          id: id++,
          sx: tx * TILE_W,
          sy: ty * TILE_H,
          canvas,
          ctx: canvas.getContext('2d')!,
          last: '',
        });
      }
    }
  }

  /** Declare the 2×2 image grid + an invisible capture container. */
  async init(): Promise<void> {
    const page = new CreateStartUpPageContainer({
      containerTotalNum: this.tiles.length + 1,
      imageObject: this.tiles.map(
        (t) =>
          new ImageContainerProperty({
            containerID: t.id,
            xPosition: t.sx,
            yPosition: t.sy,
            width: TILE_W,
            height: TILE_H,
          }),
      ),
      textObject: [
        new TextContainerProperty({
          containerID: 9,
          xPosition: 0,
          yPosition: 0,
          width: 1,
          height: 1,
          borderWidth: 0,
          isEventCapture: 1,
          content: '',
        }),
      ],
    });
    await this.bridge.createStartUpPageContainer(page);
    this.ready = true;
  }

  onGesture(cb: (g: Gesture) => void): () => void {
    return this.bridge.onEvenHubEvent((event: EvenHubEvent) => {
      const g = eventToGesture(event);
      if (g) cb(g);
    });
  }

  /**
   * Slice the 576×288 source canvas into tiles and push any that changed. Skips
   * if a previous push is still in flight (the SDK serialises one send anyway).
   */
  async render(source: HTMLCanvasElement): Promise<void> {
    if (!this.ready || this.sending) return;
    this.sending = true;
    try {
      for (const t of this.tiles) {
        t.ctx.clearRect(0, 0, TILE_W, TILE_H);
        t.ctx.drawImage(source, t.sx, t.sy, TILE_W, TILE_H, 0, 0, TILE_W, TILE_H);
        const url = t.canvas.toDataURL('image/png');
        if (url === t.last) continue;
        t.last = url;
        await this.bridge.updateImageRawData(
          new ImageRawDataUpdate({ containerID: t.id, imageData: url.split(',')[1]! }),
        );
      }
    } finally {
      this.sending = false;
    }
  }

  static get width(): number {
    return SCREEN_W;
  }
  static get height(): number {
    return SCREEN_H;
  }
}
