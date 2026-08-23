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
import { formatDuration, etaLocal } from '../core/time.js';
import { distanceNm } from '../core/geo.js';
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
    case 'ROUTE':
      return buildRoute(s);
    case 'SETTINGS':
      return buildSettings(s);
  }
}

// --- CRUISE: the primary at-a-glance strip -------------------------------

function buildCruise(s: HudState): HudContainer[] {
  const pos = s.position;
  const g = s.guidance;

  const gs = pos ? `GS ${formatKnots(pos.speedMps)}` : 'GS ---';
  const trk = pos ? `TRK ${formatDeg(pos.trackDeg)}` : 'TRK ---';
  const alt = pos ? `GPSALT ${formatFeet(pos.altitudeM)}` : 'GPSALT -----';

  // No next-waypoint here — that's on the ND. CRUISE adds what the ND doesn't:
  // destination arrival LOCAL time (for the pax PA) and the closest usable
  // enroute alternate + its likely runway in use. NO GPS shows on the exception.
  const dest = s.plan.destination;
  const destLine = !pos
    ? 'NO GPS'
    : dest
      ? `DEST ${dest.ident}  ${etaLocal(s.now, g?.eteToDestSec ?? null, dest.utcOffsetMin)}`
      : 'DEST ----';

  const a = s.closestAlternate;
  const altn = a
    ? `ALTN ${a.ident}  ${formatDeg(a.bearingDeg)}/${formatNm(a.distanceNm)}NM` +
      (a.runway ? `  RW${a.runway}` : '')
    : 'ALTN ----';

  // All in the TOP band; the lower part of the display stays clear.
  return [
    { id: 4, x: MARGIN, y: 6, w: 180, h: 34, text: gs },
    { id: 5, x: 210, y: 6, w: 170, h: 34, text: trk },
    { id: 6, x: 384, y: 6, w: RIGHT - 384, h: 34, text: alt },

    { id: 7, x: MARGIN, y: 46, w: SCREEN_W - 2 * MARGIN, h: ROW_H, text: destLine },
    { id: 1, x: MARGIN, y: 78, w: SCREEN_W - 2 * MARGIN, h: ROW_H, text: altn },
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

  // Detail mode: the best field's per-check reasons (press toggles it).
  if (s.divertDetail && s.bestReport) {
    return buildDivertDetail(s);
  }

  // No pack, or a pack but no fix yet — say which, don't show a blank page.
  if (s.alternates === null) {
    const msg =
      s.briefingAgeSec === null ? 'NO BRIEFING PACK LOADED' : 'DIVERT   waiting for GPS fix';
    return [{ id: 1, x: MARGIN, y: 10, w: W, h: ROW_H, text: msg }];
  }

  const header = `DIVERT   ${s.alternates.length} A320 FIELDS   PACK ${formatAge(s.briefingAgeSec)}`;
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

  // Up to 6 rows keeps us within the 8-text-container firmware limit (1 header).
  let row = 0;
  for (const a of s.alternates.slice(0, 6)) {
    const marker = a.best ? '*' : ' ';
    const rel = formatRelBrg(a.relBearingDeg);
    const dist = `${formatNm(a.distanceNm)}NM`;
    const ete = a.eteSec != null ? formatDuration(a.eteSec) : '--:--';
    const go = a.suitable ? 'GO' : 'WX'; // WX = ruled out on weather (ASCII; no glyph font)
    containers.push({
      id: 2 + row,
      x: MARGIN,
      y: 44 + row * ROW_H,
      w: W,
      h: ROW_H,
      text: `${marker}${a.waypoint.ident.padEnd(4)} ${rel} ${dist.padStart(6)} ${ete} ${go}`,
    });
    row++;
  }
  return containers;
}

// Detail card: WHY the best field is GO/CAUTION/NOGO — one line per check.
function buildDivertDetail(s: HudState): HudContainer[] {
  const W = SCREEN_W - 2 * MARGIN;
  const { ident, report } = s.bestReport!;
  const containers: HudContainer[] = [
    { id: 1, x: MARGIN, y: 8, w: W, h: ROW_H, text: `${ident}   ${report.verdict}` },
  ];
  // ASCII status marks — the firmware font has no check/cross glyphs.
  const mark: Record<string, string> = { pass: 'OK', fail: 'XX', unknown: '--' };
  report.checks.slice(0, 6).forEach((c, i) => {
    containers.push({
      id: 2 + i,
      x: MARGIN,
      y: 42 + i * 30,
      w: W,
      h: ROW_H,
      text: `${c.label.padEnd(3)} ${mark[c.status]}  ${c.detail}`,
    });
  });
  return containers;
}

/** Track-relative bearing as e.g. "L045" / "R120" / "AHD ". + relBearing = right. */
function formatRelBrg(rel: number): string {
  const r = Math.round(rel);
  if (Math.abs(r) < 3) return 'AHD ';
  const side = r > 0 ? 'R' : 'L';
  return side + String(Math.abs(r)).padStart(3, '0');
}

/** Pack age: "12m" under an hour, else "2h05". */
function formatAge(sec: number | null): string {
  if (sec == null) return '--';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  return `${h}h${String(min % 60).padStart(2, '0')}`;
}

// --- ROUTE: scrolling-free list of the flight plan -----------------------

function buildRoute(s: HudState): HudContainer[] {
  const wps = s.plan.waypoints;
  const activeIdx = s.plan.activeWaypointIndex;
  const containers: HudContainer[] = [
    {
      id: 1,
      x: MARGIN,
      y: 8,
      w: SCREEN_W - 2 * MARGIN,
      h: ROW_H,
      text: `ROUTE  ${wps[0]?.ident ?? '----'} → ${s.plan.destination?.ident ?? '----'}`,
    },
  ];

  // Show a window of up to 7 waypoints centred on the active one.
  const MAX = 7;
  let start = Math.max(0, activeIdx - 3);
  const end = Math.min(wps.length, start + MAX);
  start = Math.max(0, end - MAX);

  let row = 0;
  for (let i = start; i < end; i++) {
    const wp = wps[i]!;
    const marker = i === activeIdx ? '›' : ' ';
    let detail = '';
    if (i === activeIdx && s.position) {
      detail = `  ${formatNm(distanceNm(s.position, wp))} NM`;
    } else if (i > 0) {
      detail = `  ${formatNm(distanceNm(wps[i - 1]!, wp))} NM`;
    }
    containers.push({
      id: 2 + row,
      x: MARGIN,
      y: 44 + row * ROW_H,
      w: SCREEN_W - 2 * MARGIN,
      h: ROW_H,
      text: `${marker} ${wp.ident}${detail}`,
    });
    row++;
  }
  return containers;
}

// --- SETTINGS ------------------------------------------------------------

function buildSettings(s: HudState): HudContainer[] {
  const lines = [
    'SETTINGS',
    `Clock:     ${s.config.clock.toUpperCase()}   (double-press to toggle)`,
    `Auto-seq:  ${s.config.autoSequence ? 'ON' : 'OFF'}   (press to toggle)`,
    'Swipe: CRUISE - DIVERT - ROUTE - SETTINGS',
    'DIVERT: offline alternates from the briefing pack',
  ];
  return lines.map((text, i) => ({
    id: 1 + i,
    x: MARGIN,
    y: 12 + i * ROW_H,
    w: SCREEN_W - 2 * MARGIN,
    h: ROW_H,
    text,
  }));
}
