/**
 * View builders: pure functions from HudState to the list of positioned text
 * containers for a given view. Container ids are stable *within* a view so the
 * renderer can diff and send only the fields that changed.
 *
 * The layout is designed around the G2's single fixed font (no size control):
 * a compact, high-contrast data strip rather than scaled digits.
 */
import { SCREEN_W } from '../bridge/bridge.js';
import type { HudContainer } from '../bridge/bridge.js';
import { formatKnots, formatDeg, formatFeet, formatNm } from '../core/units.js';
import { etaLocal } from '../core/time.js';
import type { HudView, HudState } from './model.js';

const ROW_H = 30;
const MARGIN = 14;
const RIGHT = SCREEN_W - MARGIN;

export function buildView(view: HudView, s: HudState): HudContainer[] {
  switch (view) {
    case 'CRUISE':
      return buildCruise(s);
    case 'DIVERT':
      return buildDivert(s);
    case 'DEST':
      return buildDest(s);
    case 'SETTINGS':
      return buildSettings(s);
  }
}

// --- CRUISE: the primary at-a-glance strip -------------------------------

function buildCruise(s: HudState): HudContainer[] {
  const pos = s.position;
  const g = s.guidance;

  // GPS stale (a last fix but nothing recent): don't show a frozen ground speed
  // as if it were live — blank the values and flag it, so a dropped feed reads
  // as a dropped feed, not as valid data.
  const stale = s.gpsStale;
  const gs = !pos ? 'GS ---' : stale ? 'GS --- GPS?' : `GS ${formatKnots(pos.speedMps)}`;

  // Declutter: minimal by default (GS only) so nothing competes with the
  // outside view. A long-press reveals the full strip while held; a tap latches
  // it. Kept minimal automatically in a critical phase (low/slow).
  if (!s.cruiseFull) {
    return [{ id: 4, x: MARGIN, y: 6, w: 260, h: 34, text: gs }];
  }

  const trk = !pos || stale ? 'TRK ---' : `TRK ${formatDeg(pos.trackDeg)}`;
  const alt = !pos || stale ? 'GPSALT -----' : `GPSALT ${formatFeet(pos.altitudeM)}`;

  // No next-waypoint here — that's on the ND. CRUISE adds what the ND doesn't:
  // the closest usable enroute alternate (runway in use + VMC/IMC) on the left,
  // and destination arrival LOCAL time (for the pax PA) on the right.
  const a = s.closestAlternate;
  const altn = !pos
    ? 'NO GPS'
    : stale
      ? 'GPS STALE - reconnecting'
      : a
        ? `ALTN ${a.ident} ${formatDeg(a.bearingDeg)}/${Math.round(a.distanceNm)}NM` +
          (a.runway ? ` RW${a.runway}` : '') +
          (a.wx ? ` ${a.wx}` : '')
        : 'ALTN ----';

  const dest = s.plan.destination;
  const destText =
    pos && dest ? `${dest.ident} ${etaLocal(s.now, g?.eteToDestSec ?? null, dest.utcOffsetMin)}` : '';

  // All in the TOP band; the lower part of the display stays clear.
  return [
    { id: 4, x: MARGIN, y: 6, w: 180, h: 34, text: gs },
    { id: 5, x: 210, y: 6, w: 170, h: 34, text: trk },
    { id: 6, x: 384, y: 6, w: RIGHT - 384, h: 34, text: alt },

    { id: 7, x: MARGIN, y: 46, w: 400, h: ROW_H, text: altn },
    { id: 8, x: 416, y: 46, w: RIGHT - 416, h: ROW_H, text: destText },
  ];
}

// --- DIVERT: offline diversion picture from the briefing pack -------------
//
// The reason this product exists without connectivity: every A320-capable
// field in the pre-flight pack, ranked suitable-then-nearest, each judged from
// its cached TAF at the current time. Track-relative bearing so it reads
// track-up like the alternates on a nav display.

function buildDivert(s: HudState): HudContainer[] {
  const W = SCREEN_W - 2 * MARGIN;

  // Detail leaf: the selected field's raw METAR/TAF (tap on a list row opens it).
  if (s.focus === 'detail' && s.selectedWx) {
    return buildDivertWx(s);
  }

  // No pack, or a pack but no fix yet — say which, don't show a blank page.
  if (s.alternates === null) {
    const msg =
      s.briefingAgeSec === null ? 'NO BRIEFING PACK LOADED' : 'DIVERT   waiting for GPS fix';
    return [{ id: 1, x: MARGIN, y: 10, w: W, h: ROW_H, text: msg }];
  }

  const shown = Math.min(4, s.alternates.length); // the 4 most suitable
  // The 4-up is always glanceable and cursor-less: swipe changes page. Two taps
  // open the weather browser (double-tap is the gesture the G2 delivers).
  const hint = shown > 0 ? '2TAP=WX' : '';
  const header = `DIVERT  ${shown} ALTN  PACK ${formatAge(s.briefingAgeSec)}  ${hint}`.trimEnd();
  const containers: HudContainer[] = [
    { id: 1, x: MARGIN, y: 8, w: W, h: ROW_H, text: header },
  ];

  if (s.alternates.length === 0) {
    containers.push({
      id: 2,
      x: MARGIN,
      y: 44,
      w: W,
      h: ROW_H,
      text: 'no suitable A320 field in range',
    });
    return containers;
  }

  // The 4 most suitable, each with runway in use and VMC/IMC.
  let row = 0;
  for (const a of s.alternates.slice(0, 4)) {
    const rel = formatRelBrg(a.relBearingDeg);
    const dist = `${formatNm(a.distanceNm)}NM`;
    const rwy = a.runway ? `RW${a.runway}` : 'RW--';
    const wx = a.wx ?? '-';
    containers.push({
      id: 2 + row,
      x: MARGIN,
      y: 46 + row * 34,
      w: W,
      h: ROW_H,
      text: ` ${a.waypoint.ident.padEnd(4)} ${rel} ${dist.padStart(6)}  ${rwy} ${wx}`,
    });
    row++;
  }
  return containers;
}

// Weather browser: the selected alternate's latest raw METAR + TAF with the
// go/no-go verdict. Swipe steps through the alternates (N/M shows the position);
// two taps step back out to the pages.
function buildDivertWx(s: HudState): HudContainer[] {
  const W = SCREEN_W - 2 * MARGIN;
  const { ident, report, metarRaw, tafRaw } = s.selectedWx!;
  const total = Math.min(4, s.alternates?.length ?? 0);
  const pos = total ? `${s.divertSelection + 1}/${total}` : '';
  const lines: string[] = [`${ident} ${pos}  ${report.verdict}  2TAP=BACK`.replace(/\s+/g, ' ')];
  lines.push(...(metarRaw ? wrap('M ' + metarRaw, 2) : ['M  no METAR']));
  lines.push(...(tafRaw ? wrap('T ' + tafRaw, 4) : ['T  no TAF']));
  return lines.slice(0, 8).map((text, i) => ({
    id: i + 1,
    x: MARGIN,
    y: 8 + i * 30,
    w: W,
    h: ROW_H,
    text,
  }));
}

/** Track-relative bearing as e.g. "L045" / "R120" / "AHD ". + relBearing = right. */
function formatRelBrg(rel: number): string {
  const r = Math.round(rel);
  if (Math.abs(r) < 3) return 'AHD ';
  const side = r > 0 ? 'R' : 'L';
  return side + String(Math.abs(r)).padStart(3, '0');
}

/** Greedy word-wrap into at most `maxLines`, continuation lines indented. */
function wrap(text: string, maxLines: number, width = 46): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > width) {
      lines.push(lines.length ? '  ' + cur : cur);
      cur = w;
      if (lines.length >= maxLines) break;
    } else {
      cur = cur ? cur + ' ' + w : w;
    }
  }
  if (cur && lines.length < maxLines) lines.push(lines.length ? '  ' + cur : cur);
  return lines;
}

/** Pack age: "12m" under an hour, else "2h05". */
function formatAge(sec: number | null): string {
  if (sec == null) return '--';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  return `${h}h${String(min % 60).padStart(2, '0')}`;
}

// --- DEST: the destination's arrival time + latest weather ----------------
//
// Replaces the old ROUTE list (which only mirrored the ND). This is the field
// you actually want a read on in the cruise: arrival LOCAL time for the PA,
// likely runway, VMC/IMC, the go/no-go verdict, and the raw METAR/TAF frozen
// into the pack before departure.

function buildDest(s: HudState): HudContainer[] {
  const W = SCREEN_W - 2 * MARGIN;
  const d = s.destWx;
  if (!d) {
    return [{ id: 1, x: MARGIN, y: 10, w: W, h: ROW_H, text: 'DEST   no destination set' }];
  }
  const arr = d.arrivalLocal ?? '--:--LT';
  const rwy = d.runway ? `RW${d.runway}` : 'RW--';
  const wx = d.wx ?? '-';
  const verdict = d.report ? `  ${d.report.verdict}` : '';
  const header = `DEST ${d.ident}  ${arr}  ${rwy} ${wx}${verdict}`;
  const lines: string[] = [header];
  lines.push(...(d.metarRaw ? wrap('M ' + d.metarRaw, 2) : ['M  no METAR — fetch before departure']));
  lines.push(...(d.tafRaw ? wrap('T ' + d.tafRaw, 4) : ['T  no TAF']));
  return lines.slice(0, 8).map((text, i) => ({
    id: i + 1,
    x: MARGIN,
    y: 8 + i * 30,
    w: W,
    h: ROW_H,
    text,
  }));
}

// --- SETTINGS ------------------------------------------------------------

// SETTINGS: two taps enter edit mode; swipe moves the '>' cursor over the rows;
// two taps activate the highlighted row — toggling a setting, or "< Back" to
// leave. Cursor and hint appear only once editing (matching every other page).
function buildSettings(s: HudState): HudContainer[] {
  const editing = s.focus !== 'page';
  const hint = editing ? '2TAP=SET' : '2TAP=EDIT';
  const rows = [
    `Clock     ${s.config.clock.toUpperCase()}`,
    `Auto-seq  ${s.config.autoSequence ? 'ON' : 'OFF'}`,
    '< Back',
  ];
  const lines: string[] = [`SETTINGS   ${hint}`];
  rows.forEach((r, i) => {
    const marker = editing && i === s.settingsSelection ? '>' : ' ';
    lines.push(`${marker}${r}`);
  });
  lines.push('Swipe: CRUISE - DIVERT - DEST - SETTINGS');
  lines.push('CRUISE: hold = peek info, 2tap = keep it on');
  return lines.map((text, i) => ({
    id: 1 + i,
    x: MARGIN,
    y: 12 + i * ROW_H,
    w: SCREEN_W - 2 * MARGIN,
    h: ROW_H,
    text,
  }));
}
