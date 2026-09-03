/**
 * Time helpers. Airline operations run on UTC ("Zulu"), so UTC is the primary
 * clock; local is a convenience toggle.
 */

/** "HH:MM:SS" in UTC. */
export function formatUtcClock(now: Date): string {
  return (
    pad2(now.getUTCHours()) + ':' + pad2(now.getUTCMinutes()) + ':' + pad2(now.getUTCSeconds())
  );
}

/** "HH:MM:SS" in the host's local zone. */
export function formatLocalClock(now: Date): string {
  return pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + ':' + pad2(now.getSeconds());
}

/**
 * Estimated time en route in seconds to cover `distNm` at ground speed
 * `gsKt`. Returns null when ground speed is too low to give a meaningful
 * estimate (avoids "ETE 999:59" style noise when stationary).
 */
export function eteSeconds(distNm: number | null, gsKt: number | null): number | null {
  if (distNm == null || gsKt == null || !Number.isFinite(distNm) || !Number.isFinite(gsKt)) {
    return null;
  }
  if (gsKt < 10) return null; // below taxi/creep speed: no useful ETE
  return (distNm / gsKt) * 3600;
}

/** Format a duration as "H:MM" for long enroute times, "MM:SS" under an hour. */
export function formatDuration(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return '--:--';
  const total = Math.round(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${pad2(m)}`;
  return `${pad2(m)}:${pad2(s)}`;
}

/** ETA clock "HH:MMZ" (UTC) reached by adding `eteSec` to `now`. */
export function etaUtc(now: Date, eteSec: number | null): string {
  if (eteSec == null || !Number.isFinite(eteSec)) return '--:--Z';
  const eta = new Date(now.getTime() + eteSec * 1000);
  return `${pad2(eta.getUTCHours())}:${pad2(eta.getUTCMinutes())}Z`;
}

/**
 * ETA at a destination whose UTC offset is `offsetMin`, as "HH:MMLT" (local
 * wall-clock) — for passenger-announcement / arrival time. Returns "--:--LT"
 * when the ETE or the offset is unknown. DST is the caller's problem: the offset
 * must already be the one in effect on arrival.
 */
export function etaLocal(
  now: Date,
  eteSec: number | null,
  offsetMin: number | null | undefined,
): string {
  if (eteSec == null || !Number.isFinite(eteSec) || offsetMin == null) return '--:--LT';
  const eta = new Date(now.getTime() + eteSec * 1000 + offsetMin * 60_000);
  return `${pad2(eta.getUTCHours())}:${pad2(eta.getUTCMinutes())}LT`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * UTC offset (minutes) for an IANA time zone at instant `at`, DST-correct — via
 * the platform's Intl/ICU data (available in the WebView). Returns null for an
 * unknown zone. Used to turn destination arrival into exact local time.
 */
export function tzOffsetMin(tz: string, at: Date): number | null {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const parts = dtf.formatToParts(at);
    const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value);
    const asUtc = Date.UTC(
      get('year'),
      get('month') - 1,
      get('day'),
      get('hour'),
      get('minute'),
      get('second'),
    );
    if (Number.isNaN(asUtc)) return null;
    return Math.round((asUtc - at.getTime()) / 60_000);
  } catch {
    return null;
  }
}
