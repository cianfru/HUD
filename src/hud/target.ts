/**
 * Head-slewed target-acquisition view.
 *
 * The pilot turns their head to look around; airports are drawn where they
 * actually are in azimuth (bearing minus head direction), so a field 90° right
 * appears when you look 90° right. A fixed reticle sits at boresight; the field
 * nearest it is the "candidate". A ring click locks the candidate and opens a
 * detail card.
 *
 * This needs only head AZIMUTH (yaw), not aircraft attitude — which is why it is
 * feasible on the G2's head IMU where a conformal attitude HUD is not. Absolute
 * yaw drifts (no reliable cockpit heading reference), so in practice this pairs
 * with a "look ahead + click to re-centre" gesture; here head angle is exact.
 */
import { angleDiffDeg } from '../core/geo.js';
import { formatDeg } from '../core/units.js';
import { formatDuration } from '../core/time.js';
import { text, diamond, ring, NIGHT } from './draw.js';
import type { Palette } from './draw.js';
import type { Alternate } from '../core/diversion.js';
import { horizonRollDeg } from '../core/attitude.js';
import type { Attitude } from '../core/attitude.js';

/** Pitch ladder scale, display pixels per degree. */
const PITCH_PPD = 3.6;
const deg2rad = (d: number): number => (d * Math.PI) / 180;

const W = 576;
const H = 288;
/** Instantaneous horizontal field of view of the display window, degrees. */
export const FOV_DEG = 44;
const PX_PER_DEG = W / FOV_DEG;
/** Reticle capture half-angle: a field within this of boresight is the candidate. */
export const CAPTURE_DEG = 6;
const RETICLE_Y = 150;

export interface LockedTarget {
  ident: string;
  name: string;
  bearingDeg: number;
  distanceNm: number;
  eteSec: number | null;
  suitable: boolean;
  rwy: string;
  metar: string;
}

export interface TargetViewState {
  alternates: Alternate[];
  gsKt: number | null;
  altFt: number | null;
  trackDeg: number | null;
  /** Head azimuth relative to ground track, degrees (+ = looking right). */
  headOffsetDeg: number;
  locked: LockedTarget | null;
  /** Aircraft attitude from the mounted-phone AHRS. Omit to hide the horizon. */
  attitude?: Attitude | null;
  /** Head roll relative to the airframe, degrees (+ = head tilted right). */
  headRollDeg?: number;
}

/** The field under the reticle (nearest in azimuth within CAPTURE_DEG), or null. */
export function pickCandidate(
  alternates: Alternate[],
  headOffsetDeg: number,
  captureDeg = CAPTURE_DEG,
): Alternate | null {
  let best: Alternate | null = null;
  let bestOff = captureDeg;
  for (const a of alternates) {
    const off = Math.abs(angleDiffDeg(a.relBearingDeg, headOffsetDeg));
    if (off <= bestOff) {
      bestOff = off;
      best = a;
    }
  }
  return best;
}

export function drawTargetView(
  ctx: CanvasRenderingContext2D,
  s: TargetViewState,
  pal: Palette = NIGHT,
): void {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#010603';
  ctx.fillRect(0, 0, W, H);
  ctx.shadowColor = pal.mid;
  ctx.shadowBlur = pal.glow;

  drawAzimuthTape(ctx, s, pal);

  const candidate = pickCandidate(s.alternates, s.headOffsetDeg);

  // World overlay (horizon + targets), transformed by aircraft attitude and
  // counter-rotated by head roll so it stays pinned to the real world. The
  // boresight is the origin; the reticle stays screen-fixed.
  const att = s.attitude ?? null;
  const rollDeg = att ? horizonRollDeg(att.rollDeg, s.headRollDeg ?? 0) : 0;
  const pitchPx = att ? att.pitchDeg * PITCH_PPD : 0;

  ctx.save();
  ctx.translate(W / 2, RETICLE_Y);
  ctx.rotate(deg2rad(rollDeg));
  drawHorizon(ctx, pitchPx, !!att, pal);
  drawMarkers(ctx, s, candidate, pitchPx, pal);
  ctx.restore();

  drawReticle(ctx, candidate, pal);
  drawOffscreenCue(ctx, s, pal);
  drawFooter(ctx, s, pal);
  if (att) drawAttitudeReadout(ctx, att, s.headRollDeg ?? 0, pal);

  if (s.locked) drawLockCard(ctx, s.locked, pal);

  ctx.shadowBlur = 0;
}

/** Horizon line (+ pitch ladder when attitude is live), drawn in the boresight frame. */
function drawHorizon(ctx: CanvasRenderingContext2D, pitchPx: number, full: boolean, pal: Palette): void {
  const half = 340;
  const gap = 26;
  const y = pitchPx;
  ctx.strokeStyle = full ? pal.dim : pal.ghost;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-half, y);
  ctx.lineTo(-gap, y);
  ctx.moveTo(gap, y);
  ctx.lineTo(half, y);
  ctx.stroke();
  if (!full) return;

  // A couple of pitch rungs above and below.
  for (const d of [-10, -5, 5, 10]) {
    const ry = y - d * PITCH_PPD; // +pitch (nose up) sits below horizon in view
    const w = d % 10 === 0 ? 46 : 30;
    ctx.strokeStyle = pal.faint;
    ctx.beginPath();
    ctx.moveTo(-w, ry);
    ctx.lineTo(-gap, ry);
    ctx.moveTo(gap, ry);
    ctx.lineTo(w, ry);
    ctx.stroke();
    text(ctx, String(Math.abs(d)), -w - 12, ry, 8, pal.faint);
    text(ctx, String(Math.abs(d)), w + 12, ry, 8, pal.faint);
  }
}

/** Airport markers, drawn in the boresight frame so they ride the horizon. */
function drawMarkers(
  ctx: CanvasRenderingContext2D,
  s: TargetViewState,
  candidate: Alternate | null,
  pitchPx: number,
  pal: Palette,
): void {
  const onScreen = s.alternates
    .map((a) => ({ a, off: angleDiffDeg(a.relBearingDeg, s.headOffsetDeg) }))
    .filter((t) => Math.abs(t.off) <= FOV_DEG / 2)
    .sort((p, q) => q.a.distanceNm - p.a.distanceNm);

  for (const { a, off } of onScreen) {
    const x = off * PX_PER_DEG;
    const y = pitchPx;
    if (candidate === a) {
      diamond(ctx, x, y, 7, pal.bright, true);
      text(ctx, a.waypoint.ident, x, y - 18, 14, pal.bright, 'center', 700);
      text(ctx, `${a.distanceNm.toFixed(0)} NM`, x, y + 17, 11, pal.mid);
    } else {
      ring(ctx, x, y, 5, pal.dim, a.suitable);
      text(ctx, a.waypoint.ident, x, y - 15, 11, pal.dim);
    }
  }
}

/** Small numeric bank/pitch readout (screen-fixed). */
function drawAttitudeReadout(
  ctx: CanvasRenderingContext2D,
  att: Attitude,
  headRollDeg: number,
  pal: Palette,
): void {
  const bank = Math.round(att.rollDeg);
  const pitch = Math.round(att.pitchDeg);
  const bankStr = bank === 0 ? 'WINGS LVL' : `BANK ${Math.abs(bank)}°${bank > 0 ? 'R' : 'L'}`;
  const pitchStr = `${Math.abs(pitch)}°${pitch >= 0 ? 'U' : 'D'}`;
  const head = headRollDeg !== 0 ? `  HEAD ${Math.abs(Math.round(headRollDeg))}°${headRollDeg > 0 ? 'R' : 'L'}` : '';
  text(ctx, `${bankStr}  PITCH ${pitchStr}${head}`, W / 2, 62, 11, pal.mid, 'center', 700);
}

// --- azimuth tape (where am I looking) -----------------------------------

function drawAzimuthTape(ctx: CanvasRenderingContext2D, s: TargetViewState, pal: Palette): void {
  const cx = W / 2;
  const y = 20;
  const tapePx = 8;
  const track = s.trackDeg ?? 0;
  const look = (track + s.headOffsetDeg + 360) % 360;

  for (let d = -30; d <= 30; d += 10) {
    const x = cx + d * tapePx;
    const major = d % 30 === 0;
    ctx.strokeStyle = pal.faint;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + (major ? 8 : 5));
    ctx.stroke();
    const b = (look + d + 360) % 360;
    text(ctx, String(Math.round(b / 10)).padStart(2, '0'), x, y - 8, 8, pal.faint);
  }
  // Boresight caret.
  ctx.fillStyle = pal.bright;
  ctx.beginPath();
  ctx.moveTo(cx, y + 10);
  ctx.lineTo(cx - 5, y + 2);
  ctx.lineTo(cx + 5, y + 2);
  ctx.closePath();
  ctx.fill();
  text(ctx, `LOOK ${formatDeg(look)}`, cx, y + 24, 11, pal.mid, 'center', 700);

  // Aircraft-nose marker (track = offset 0) relative to the head.
  const noseX = cx + -s.headOffsetDeg * tapePx;
  if (Math.abs(s.headOffsetDeg) <= 34) {
    text(ctx, '▽ NOSE', noseX, y + 2 + 4, 9, pal.dim);
  }
}

// --- reticle -------------------------------------------------------------

function drawReticle(ctx: CanvasRenderingContext2D, candidate: Alternate | null, pal: Palette): void {
  const cx = W / 2;
  const y = RETICLE_Y;
  const c = candidate ? pal.bright : pal.dim;
  const r = 14;
  // Corner brackets.
  ctx.strokeStyle = c;
  ctx.lineWidth = candidate ? 2 : 1;
  const b = 6;
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(cx + sx * r, y + sy * r - sy * b);
    ctx.lineTo(cx + sx * r, y + sy * r);
    ctx.lineTo(cx + sx * r - sx * b, y + sy * r);
    ctx.stroke();
  }
}

// --- off-screen cue ------------------------------------------------------

function drawOffscreenCue(ctx: CanvasRenderingContext2D, s: TargetViewState, pal: Palette): void {
  let nearest: { a: Alternate; off: number } | null = null;
  for (const a of s.alternates) {
    if (!a.suitable) continue;
    const off = angleDiffDeg(a.relBearingDeg, s.headOffsetDeg);
    if (Math.abs(off) <= FOV_DEG / 2) continue; // it's on screen already
    if (!nearest || a.distanceNm < nearest.a.distanceNm) nearest = { a, off };
  }
  if (!nearest) return;
  const right = nearest.off > 0;
  const x = right ? W - 14 : 14;
  const y = RETICLE_Y;
  ctx.fillStyle = pal.mid;
  ctx.beginPath();
  const d = right ? 12 : -12;
  ctx.moveTo(x, y);
  ctx.lineTo(x - d, y - 7);
  ctx.lineTo(x - d, y + 7);
  ctx.closePath();
  ctx.fill();
  const label = `${nearest.a.waypoint.ident} ${Math.abs(Math.round(nearest.off))}°`;
  text(ctx, label, right ? W - 20 : 20, y - 30, 10, pal.mid, right ? 'right' : 'left', 700);
}

// --- footer readouts (kept low, over the dark glareshield) ----------------

function drawFooter(ctx: CanvasRenderingContext2D, s: TargetViewState, pal: Palette): void {
  const y = 274;
  const gs = s.gsKt != null ? String(Math.round(s.gsKt)) : '---';
  const alt = s.altFt != null ? Math.round(s.altFt).toLocaleString('en-US') : '-----';
  const side =
    s.headOffsetDeg > 1
      ? `R${Math.round(s.headOffsetDeg)}°`
      : s.headOffsetDeg < -1
        ? `L${Math.round(-s.headOffsetDeg)}°`
        : 'AHEAD';
  text(ctx, `GS ${gs}`, 14, y, 12, pal.mid, 'left', 700);
  text(ctx, `TRK ${formatDeg(s.trackDeg)}   HEAD ${side}`, W / 2, y, 12, pal.mid, 'center', 700);
  text(ctx, `${alt} FT`, W - 14, y, 12, pal.mid, 'right', 700);
}

// --- lock card -----------------------------------------------------------

function drawLockCard(ctx: CanvasRenderingContext2D, t: LockedTarget, pal: Palette): void {
  // Dim the sweep behind the card.
  ctx.fillStyle = 'rgba(1,6,3,0.72)';
  ctx.fillRect(0, 0, W, H);

  const x0 = 64;
  const y0 = 48;
  const x1 = W - 64;
  const y1 = H - 52;
  ctx.strokeStyle = pal.bright;
  ctx.lineWidth = 2;
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);

  const lx = x0 + 20;
  text(ctx, `▣ LOCKED   ${t.ident}`, lx, y0 + 24, 17, pal.bright, 'left', 700);
  text(ctx, t.suitable ? 'SUITABLE' : 'NOT SUITABLE', x1 - 20, y0 + 24, 12, t.suitable ? pal.mid : pal.dim, 'right', 700);
  text(ctx, t.name, lx, y0 + 48, 12, pal.dim, 'left');

  text(
    ctx,
    `BRG ${formatDeg(t.bearingDeg)}°    DIST ${t.distanceNm.toFixed(0)} NM    ETE ${formatDuration(t.eteSec)}`,
    lx,
    y0 + 76,
    14,
    pal.mid,
    'left',
    700,
  );
  text(ctx, `RWY ${t.rwy}`, lx, y0 + 100, 13, pal.mid, 'left');
  text(ctx, `METAR ${t.metar}`, lx, y0 + 122, 11, pal.dim, 'left');

  text(ctx, '◦ ring: release      demo data', lx, y1 - 16, 11, pal.dim, 'left');
}
