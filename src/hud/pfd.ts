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
import { text, boxedText, rail, diamond, ring, NIGHT } from './draw.js';
import type { Palette } from './draw.js';

export { NIGHT, DAY } from './draw.js';
export type { Palette } from './draw.js';

export const PFD_W = 576;
export const PFD_H = 288;

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

/**
 * Decluttered "context engine" variant: mostly black, one salient answer.
 * A single top line (best alternate + bearing/distance/ETE), a compressed
 * track-up cluster (ownship + a few forward fields, no range arcs), and tiny
 * corner readouts. Designed to add as few lit pixels to the forward view as
 * possible while still answering "where would I go right now?".
 */
export function drawPfdMinimal(
  ctx: CanvasRenderingContext2D,
  s: PfdState,
  pal: Palette = NIGHT,
): void {
  ctx.clearRect(0, 0, PFD_W, PFD_H);
  ctx.fillStyle = '#010603';
  ctx.fillRect(0, 0, PFD_W, PFD_H);
  ctx.shadowColor = pal.mid;
  ctx.shadowBlur = pal.glow;

  const cx = PFD_W / 2;
  const oy = 250;

  const best = s.alternates.find((a) => a.best);
  if (best) {
    const line =
      `◈ ${best.waypoint.ident}   ${formatDeg(best.bearingDeg)}°   ` +
      `${best.distanceNm.toFixed(0)} NM   WX ✓   ${formatDuration(best.eteSec)}`;
    text(ctx, line, cx, 22, 14, pal.bright, 'center', 700);
  } else {
    text(ctx, 'NO SUITABLE ALTERNATE IN RANGE', cx, 22, 12, pal.dim, 'center', 700);
  }

  // Compressed track-up cluster — no arcs, just relative geometry.
  const plotted = s.alternates.filter((a) => Math.abs(a.relBearingDeg) <= 95).slice(0, 4);
  const maxNm = Math.max(120, best ? best.distanceNm : 0, ...plotted.map((a) => a.distanceNm)) * 1.1;
  const planR = 150;

  ctx.strokeStyle = pal.ghost;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, oy - 12);
  ctx.lineTo(cx, 46);
  ctx.stroke();

  for (const a of [...plotted].sort((p, q) => q.distanceNm - p.distanceNm)) {
    const r = Math.min(planR, (a.distanceNm / maxNm) * planR);
    const ang = (a.relBearingDeg * Math.PI) / 180;
    const x = cx + Math.sin(ang) * r;
    const y = oy - Math.cos(ang) * r;
    if (y < 44) continue;
    if (a.best) {
      diamond(ctx, x, y, 6, pal.bright, true);
      text(ctx, a.waypoint.ident, x, y - 14, 12, pal.bright, 'center', 700);
    } else {
      ring(ctx, x, y, 4, pal.dim, a.suitable);
    }
  }

  // Ownship chevron.
  ctx.fillStyle = pal.bright;
  ctx.beginPath();
  ctx.moveTo(cx, oy - 8);
  ctx.lineTo(cx + 6, oy + 6);
  ctx.lineTo(cx, oy + 2);
  ctx.lineTo(cx - 6, oy + 6);
  ctx.closePath();
  ctx.fill();

  // Tiny corner readouts.
  text(ctx, `GS ${s.gsKt != null ? Math.round(s.gsKt) : '---'}`, 14, 274, 12, pal.mid, 'left', 700);
  const alt = s.altFt != null ? Math.round(s.altFt).toLocaleString('en-US') : '-----';
  text(ctx, `${alt} FT`, PFD_W - 14, 274, 12, pal.mid, 'right', 700);
  text(ctx, formatDeg(s.trackDeg), cx, 274, 12, pal.mid, 'center', 700);

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
