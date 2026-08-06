/**
 * Shared low-level canvas primitives for the HUD renderers. Monochrome-green,
 * monospace, drawn in 576x288 logical space.
 */

export interface Palette {
  bright: string;
  mid: string;
  dim: string;
  faint: string;
  ghost: string;
  glow: number;
}

export const NIGHT: Palette = {
  bright: '#8affc0',
  mid: '#37f39a',
  dim: '#1f9c64',
  faint: '#136a42',
  ghost: '#0c3d28',
  glow: 7,
};

export const DAY: Palette = {
  bright: '#baffda',
  mid: '#5cf3a6',
  dim: '#2bbf78',
  faint: '#1c7d50',
  ghost: '#124d33',
  glow: 2,
};

/**
 * Grayscale palette for rendering to an IMAGE container on the glasses: the
 * firmware maps a pushed PNG's luminance to the 16-level green display (black =
 * unlit). Rendering white-on-black gives the cleanest brightness → intensity
 * mapping, spread across the 16 levels. No glow (shadowBlur doesn't map well).
 */
export const GRAY: Palette = {
  bright: '#ffffff',
  mid: '#c8c8c8',
  dim: '#8c8c8c',
  faint: '#5a5a5a',
  ghost: '#323232',
  glow: 0,
};

export function text(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  size: number,
  col: string,
  align: CanvasTextAlign = 'center',
  weight = 400,
): void {
  ctx.fillStyle = col;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.font = `${weight} ${size}px ui-monospace, "DejaVu Sans Mono", Menlo, monospace`;
  ctx.fillText(s, x, y);
}

export function boxedText(
  ctx: CanvasRenderingContext2D,
  s: string,
  cx: number,
  cy: number,
  size: number,
  ink: string,
  border: string,
): void {
  const w = s.length * size * 0.62 + 10;
  const h = size + 8;
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
  text(ctx, s, cx, cy + 1, size, ink, 'center', 700);
}

export function rail(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  col: string,
): void {
  ctx.strokeStyle = col;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + h);
  ctx.stroke();
}

export function diamond(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  col: string,
  fill: boolean,
): void {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = col;
    ctx.fill();
  } else {
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

export function ring(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  col: string,
  filled: boolean,
): void {
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  if (filled) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}
