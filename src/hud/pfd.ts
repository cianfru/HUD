/**
 * PFD-style HUD renderer, drawn to a 2D canvas context in 576x288 logical
 * space. Layout follows primary-flight-display convention adapted to the G2:
 *
 *   - Ground speed on the LEFT           - GPS altitude on the RIGHT
 *   - Track/heading tape along the BOTTOM
 *   - A track-up DIVERSION plan in the centre: suitable alternates plotted by
 *     bearing & distance; the best one highlighted with ident, bearing, distance
 *   - A salient BEST-DIVERT callout across the top
 *
 * The G2 is monochrome green with no amber, so state is carried by BRIGHTNESS
 * and FILL, never colour: the best field is bright and filled; other suitable
 * fields are dim filled dots; unsuitable fields are hollow rings.
 *
 * On real hardware this maps to text containers (GS / ALT / TRK / callout) plus
 * one image container for the centre plan; here it renders directly to canvas.
 */
import { formatDeg } from '../core/units.js';
import { formatDuration } from '../core/time.js';
import type { Alternate } from '../core/diversion.js';

export const PFD_W = 576;
export const PFD_H = 288;

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

export interface PfdState {
  gsKt: number | null;
  altFt: number | null;
  trackDeg: number | null;
  clock: string;
  mode: 'CRUISE' | 'DIVERT';
  alternates: Alternate[];
}

/** Nautical-mile radius of the centre plan (outer range ring). */
const MAX_NM = 200;
const RANGE_RINGS = [50, 100, 150, 200];

export function drawPfd(
  ctx: CanvasRenderingContext2D,
  s: PfdState,
  pal: Palette = NIGHT,
): void {
  ctx.clearRect(0, 0, PFD_W, PFD_H);
  ctx.fillStyle = '#020d06';
  ctx.fillRect(0, 0, PFD_W, PFD_H);
  ctx.shadowColor = pal.mid;
  ctx.shadowBlur = pal.glow;

  drawTopCallout(ctx, s, pal);
  drawSpeed(ctx, s.gsKt, pal);
  drawAltitude(ctx, s.altFt, pal);
  drawPlan(ctx, s, pal);
  drawTrackTape(ctx, s.trackDeg, pal);

  ctx.shadowBlur = 0;
}

// --- top callout: mode/clock + best-divert salient line ------------------

function drawTopCallout(ctx: CanvasRenderingContext2D, s: PfdState, pal: Palette): void {
  text(ctx, `${s.mode}  ${s.clock}`, 10, 16, 10, pal.dim, 'left', 700);

  const best = s.alternates.find((a) => a.best);
  if (best) {
    const parts = [
      `◈ ${best.waypoint.ident}`,
      `${formatDeg(best.bearingDeg)}°`,
      `${best.distanceNm.toFixed(0)} NM`,
      'WX ✓',
      `${formatDuration(best.eteSec)}`,
    ];
    text(ctx, parts.join('   '), PFD_W / 2, 16, 15, pal.bright, 'center', 700);
  } else {
    text(ctx, 'NO SUITABLE ALTERNATE IN RANGE', PFD_W / 2, 16, 12, pal.dim, 'center', 700);
  }
}

// --- side readouts -------------------------------------------------------

function drawSpeed(ctx: CanvasRenderingContext2D, gsKt: number | null, pal: Palette): void {
  const cx = 40;
  rail(ctx, 8, 66, 200, pal.ghost);
  text(ctx, 'GS', cx, 108, 9, pal.dim, 'center', 700);
  boxedText(ctx, gsKt != null ? String(Math.round(gsKt)) : '---', cx, 138, 26, pal.mid, pal.dim);
  text(ctx, 'KT', cx, 168, 9, pal.dim);
}

function drawAltitude(ctx: CanvasRenderingContext2D, altFt: number | null, pal: Palette): void {
  const cx = PFD_W - 52;
  rail(ctx, PFD_W - 8, 66, 200, pal.ghost);
  text(ctx, 'GPS ALT', cx, 108, 9, pal.dim, 'center', 700);
  const alt = altFt != null ? Math.round(altFt).toLocaleString('en-US') : '-----';
  boxedText(ctx, alt, cx, 138, 22, pal.mid, pal.dim);
  text(ctx, 'FT', cx, 168, 9, pal.dim);
}

// --- centre: track-up diversion plan -------------------------------------

function drawPlan(ctx: CanvasRenderingContext2D, s: PfdState, pal: Palette): void {
  const cx = PFD_W / 2;
  const oy = 228; // ownship
  const planR = 180;
  const span = 1.15; // ± radians of the forward fan

  // Forward range arcs (a fan, not full rings — this is an egocentric view).
  // Labels sit on the left edge of the fan, clear of the (ahead) alternates.
  for (const nm of RANGE_RINGS) {
    const r = (nm / MAX_NM) * planR;
    ctx.strokeStyle = pal.ghost;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, oy, r, -Math.PI / 2 - span, -Math.PI / 2 + span);
    ctx.stroke();
    const lx = cx + Math.sin(-span + 0.12) * r;
    const ly = oy - Math.cos(-span + 0.12) * r;
    text(ctx, String(nm), lx, ly, 8, pal.faint, 'center');
  }

  // Faint track centreline straight ahead (track-up).
  ctx.strokeStyle = pal.ghost;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, oy - 14);
  ctx.lineTo(cx, 46);
  ctx.stroke();

  // Project every forward alternate to screen space first.
  type Plot = { a: Alternate; x: number; y: number };
  const plots: Plot[] = [];
  for (const a of s.alternates) {
    if (Math.abs(a.relBearingDeg) > 100) continue; // forward hemisphere only
    const r = Math.min(planR, (a.distanceNm / MAX_NM) * planR);
    const ang = (a.relBearingDeg * Math.PI) / 180;
    const x = cx + Math.sin(ang) * r;
    const y = oy - Math.cos(ang) * r;
    if (x < 74 || x > PFD_W - 74 || y < 42) continue; // keep clear of side rails
    plots.push({ a, x, y });
  }
  const bestPlot = plots.find((p) => p.a.best) ?? null;

  // Dim candidates first (farthest first), then the bright best on top. Suppress
  // a candidate's ident label if it would collide with the best diamond.
  for (const p of plots.filter((p) => !p.a.best).sort((p, q) => q.a.distanceNm - p.a.distanceNm)) {
    ring(ctx, p.x, p.y, 4.5, pal.dim, p.a.suitable);
    const nearBest = bestPlot && Math.hypot(p.x - bestPlot.x, p.y - bestPlot.y) < 30;
    if (!nearBest) text(ctx, p.a.waypoint.ident, p.x, p.y - 13, 10, pal.dim);
  }
  if (bestPlot) {
    const { a, x, y } = bestPlot;
    diamond(ctx, x, y, 7, pal.bright, true);
    text(ctx, a.waypoint.ident, x, y - 16, 14, pal.bright, 'center', 700);
    text(ctx, `${formatDeg(a.bearingDeg)}° ${a.distanceNm.toFixed(0)}`, x, y + 15, 10, pal.mid);
  }

  // Ownship chevron (fixed, track-up).
  ctx.fillStyle = pal.bright;
  ctx.beginPath();
  ctx.moveTo(cx, oy - 9);
  ctx.lineTo(cx + 7, oy + 7);
  ctx.lineTo(cx, oy + 3);
  ctx.lineTo(cx - 7, oy + 7);
  ctx.closePath();
  ctx.fill();
}

// --- bottom: track/heading tape ------------------------------------------

function drawTrackTape(ctx: CanvasRenderingContext2D, trackDeg: number | null, pal: Palette): void {
  const cx = PFD_W / 2;
  const baseY = 262;
  const pxPerDeg = 4.2;
  const halfWindow = 46;
  const track = trackDeg ?? 0;

  ctx.strokeStyle = pal.faint;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(20, baseY);
  ctx.lineTo(PFD_W - 20, baseY);
  ctx.stroke();

  const startTick = Math.ceil((track - halfWindow) / 5) * 5;
  for (let t = startTick; t <= track + halfWindow; t += 5) {
    const x = cx + (t - track) * pxPerDeg;
    if (x < 22 || x > PFD_W - 22) continue;
    const major = ((t % 10) + 10) % 10 === 0;
    ctx.strokeStyle = major ? pal.dim : pal.faint;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.lineTo(x, baseY + (major ? 9 : 5));
    ctx.stroke();
    if (major) {
      const label = String(Math.round((((t % 360) + 360) % 360) / 10)).padStart(2, '0');
      text(ctx, label, x, baseY + 19, 10, pal.dim);
    }
  }

  // Current-track box + lubber above the tape centre.
  ctx.fillStyle = pal.bright;
  ctx.beginPath();
  ctx.moveTo(cx, baseY - 2);
  ctx.lineTo(cx - 6, baseY - 11);
  ctx.lineTo(cx + 6, baseY - 11);
  ctx.closePath();
  ctx.fill();
  boxedText(ctx, formatDeg(track), cx, baseY - 22, 15, pal.bright, pal.dim);
}

// --- primitives ----------------------------------------------------------

function text(
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

function boxedText(
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

function rail(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, col: string): void {
  ctx.strokeStyle = col;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + h);
  ctx.stroke();
}

function diamond(
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

function ring(
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
