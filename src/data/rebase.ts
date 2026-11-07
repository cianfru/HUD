/**
 * Re-base a briefing pack's clock: shift `createdAt` and every METAR/TAF time
 * group by the same whole number of hours, so a frozen snapshot (the bundled
 * demo) reads as a fresh, self-consistent briefing captured shortly before
 * `now` — TAFs in their validity window, pack age under ~75 min.
 *
 * Only for the demo. A real flight's pack is never re-based: its age and TAF
 * validity are exactly what the pilot needs to see.
 */
import type { BriefingPack } from './briefing.js';

const HOUR = 3_600_000;
const pad = (n: number) => String(n).padStart(2, '0');

/** Resolve a day-of-month + hour to the instant nearest `ref` (month rollover). */
function resolveDay(day: number, hour: number, minute: number, ref: Date): number {
  let best = NaN;
  for (const dm of [-1, 0, 1]) {
    const t = Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + dm, day, hour, minute);
    if (Number.isNaN(best) || Math.abs(t - ref.getTime()) < Math.abs(best - ref.getTime())) best = t;
  }
  return best;
}

/** DDHH, with an end-of-period midnight written as the previous day's "24". */
function ddhh(t: number, isEnd: boolean): string {
  const d = new Date(t);
  if (isEnd && d.getUTCHours() === 0 && d.getUTCMinutes() === 0) {
    return pad(new Date(t - HOUR).getUTCDate()) + '24';
  }
  return pad(d.getUTCDate()) + pad(d.getUTCHours());
}

// DDHHMMZ | DDHH/DDHH | /DDHHZ (TX/TN) | FMDDHHMM
const GROUP_RE =
  /\b(\d{2})(\d{2})(\d{2})Z\b|\b(\d{2})(\d{2})\/(\d{2})(\d{2})\b|\/(\d{2})(\d{2})Z\b|\bFM(\d{2})(\d{2})(\d{2})\b/g;

/** Shift every time group in a METAR/TAF string by `shiftMs` (whole hours). */
export function shiftReport(raw: string, ref: Date, shiftMs: number): string {
  return raw.replace(GROUP_RE, (m, d1, h1, n1, d2, h2, d3, h3, d4, h4, d5, h5, n5) => {
    if (d1) {
      const d = new Date(resolveDay(+d1, +h1, +n1, ref) + shiftMs);
      return pad(d.getUTCDate()) + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + 'Z';
    }
    if (d2) {
      const from = resolveDay(+d2, +h2, 0, ref) + shiftMs;
      const to = resolveDay(+d3, +h3, 0, ref) + shiftMs;
      return `${ddhh(from, false)}/${ddhh(to, true)}`;
    }
    if (d4) return '/' + ddhh(resolveDay(+d4, +h4, 0, ref) + shiftMs, false) + 'Z';
    if (d5) {
      const d = new Date(resolveDay(+d5, +h5, +n5, ref) + shiftMs);
      return 'FM' + pad(d.getUTCDate()) + pad(d.getUTCHours()) + pad(d.getUTCMinutes());
    }
    return m;
  });
}

/** The pack as if captured 15-75 min before `now`. */
export function rebaseBriefing(pack: BriefingPack, now: Date = new Date()): BriefingPack {
  const created = new Date(pack.createdAt);
  // Whole hours keep DDHH groups exact; the 15-min margin keeps a TAF that
  // started just after capture inside its validity window.
  const hours = Math.floor((now.getTime() - created.getTime() - 15 * 60_000) / HOUR);
  const shiftMs = hours * HOUR;
  return {
    ...pack,
    createdAt: new Date(created.getTime() + shiftMs).toISOString(),
    weather: pack.weather.map((w) => ({
      ...w,
      metarRaw: w.metarRaw ? shiftReport(w.metarRaw, created, shiftMs) : w.metarRaw,
      tafRaw: w.tafRaw ? shiftReport(w.tafRaw, created, shiftMs) : w.tafRaw,
      metarObsSec: w.metarObsSec != null ? w.metarObsSec + shiftMs / 1000 : w.metarObsSec,
    })),
  };
}
