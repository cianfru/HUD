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
import {
  formatUtcClock,
  formatLocalClock,
  formatDuration,
  etaUtc,
} from '../core/time.js';
import { distanceNm } from '../core/geo.js';
import type { HudView, HudState } from './model.js';

const ROW_H = 30;
const MARGIN = 14;
const RIGHT = SCREEN_W - MARGIN;

export function buildView(view: HudView, s: HudState): HudContainer[] {
  switch (view) {
    case 'CRUISE':
      return buildCruise(s);
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

  const clock = s.config.clock === 'utc' ? formatUtcClock(s.now) + 'Z' : formatLocalClock(s.now);
  const elapsed = formatDuration((s.now.getTime() - s.flightStartMs) / 1000);
  const status = statusText(s);

  const gs = pos ? `GS ${formatKnots(pos.speedMps)}` : 'GS ---';
  const trk = pos ? `TRK ${formatDeg(pos.trackDeg)}` : 'TRK ---';
  const alt = pos ? `GPSALT ${formatFeet(pos.altitudeM)}` : 'GPSALT -----';

  const wpt = g?.activeWaypoint
    ? `→ ${g.activeWaypoint.ident}   BRG ${formatDeg(g.bearingToActiveDeg)}   ` +
      `${formatNm(g.distToActiveNm)} NM   ETE ${formatDuration(g.eteToActiveSec)}`
    : '→ ----   BRG ---   --- NM   ETE --:--';

  const dest = s.plan.destination
    ? `DEST ${s.plan.destination.ident}   ${formatNm(g?.distToDestNm ?? null)} NM   ` +
      `ETA ${etaUtc(s.now, g?.eteToDestSec ?? null)}`
    : 'DEST ----';

  return [
    { id: 1, x: MARGIN, y: 10, w: 150, h: ROW_H, text: clock },
    { id: 2, x: 200, y: 10, w: 140, h: ROW_H, text: `ET ${elapsed}` },
    { id: 3, x: 350, y: 10, w: RIGHT - 350, h: ROW_H, text: status },

    { id: 4, x: MARGIN, y: 92, w: 180, h: 34, text: gs },
    { id: 5, x: 210, y: 92, w: 170, h: 34, text: trk },
    { id: 6, x: 384, y: 92, w: RIGHT - 384, h: 34, text: alt },

    { id: 7, x: MARGIN, y: 168, w: SCREEN_W - 2 * MARGIN, h: ROW_H, text: wpt },
    { id: 8, x: MARGIN, y: 228, w: SCREEN_W - 2 * MARGIN, h: ROW_H, text: dest },
  ];
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
    'Swipe up/down: change page',
    'Press on CRUISE: skip to next waypoint',
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

function statusText(s: HudState): string {
  // Kept compact to fit the right edge of the 576px display.
  const fix = s.position ? '✓' : '✗';
  const acc = s.position?.accuracyM != null ? `±${Math.round(s.position.accuracyM)}m` : '';
  const bat = s.device.batteryLevel != null ? ` ${s.device.batteryLevel}%` : '';
  return `GPS ${fix} ${acc}${bat}`.replace(/\s+/g, ' ').trim();
}
