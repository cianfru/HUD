/**
 * Transparent suitability.
 *
 * "Suitable" must never be a mystery green badge — a diversion decision needs to
 * show *why* a field passed or failed. This module turns raw facts (runway,
 * surface, forecast ceiling/visibility, wind, validity, data age) into a set of
 * named checks, each pass / fail / unknown with a human-readable detail, plus an
 * overall verdict. It is pure and advisory — transparent filters, not certified
 * landing-performance.
 *
 * Hard checks gate the go/no-go (a fail = NOGO). Advisory checks (crosswind, data
 * freshness) downgrade to CAUTION but don't forbid. Missing data is UNKNOWN, and
 * unknown is never treated as good.
 */
import { toRad, angleDiffDeg } from './geo.js';
import type { FltCat } from './taf.js';

/** Map a flight category to a VMC/IMC glance flag: 'V' visual, 'I' instrument. */
export function vmcImc(cat: FltCat | null | undefined): 'V' | 'I' | null {
  return cat === 'VFR' || cat === 'MVFR' ? 'V' : cat === 'IFR' || cat === 'LIFR' ? 'I' : null;
}

export type CheckStatus = 'pass' | 'fail' | 'unknown';
export type Verdict = 'GO' | 'CAUTION' | 'NOGO' | 'UNKNOWN';

export interface SuitabilityCheck {
  key: 'runway' | 'surface' | 'ceiling' | 'visibility' | 'crosswind' | 'validity' | 'dataAge';
  /** Short label for the glasses (RWY / SFC / CIG / VIS / XW / VLD / AGE). */
  label: string;
  status: CheckStatus;
  /** Hard checks gate go/no-go; advisory checks only downgrade to CAUTION. */
  severity: 'hard' | 'advisory';
  /** One-line reason, e.g. "13124 ft >= 6562" or "800 ft < 1000". */
  detail: string;
}

export interface SuitabilityReport {
  verdict: Verdict;
  checks: SuitabilityCheck[];
  /** Human reasons behind the verdict (failing/unknown hard checks, advisory fails). */
  reasons: string[];
}

export interface SuitabilityFacts {
  longestRwyFt?: number;
  hardSurface?: boolean;
  /** True runway headings (deg) for the field's runways, for crosswind. */
  runwayHeadingsDeg?: number[];
  /** Flight category from the forecast (informational; ceiling/vis drive checks). */
  category?: FltCat;
  ceilingFt?: number;
  visM?: number;
  windDirDeg?: number | 'VRB';
  windKt?: number;
  gustKt?: number;
  withinValidity?: boolean;
  /** Whether a forecast was available at all (no TAF => weather unknown). */
  hasForecast?: boolean;
  dataAgeSec?: number;
}

export interface SuitabilityMinima {
  minRwyM?: number;
  requireHardSurface?: boolean;
  minCeilingFt?: number;
  minVisM?: number;
  maxCrosswindKt?: number;
  maxDataAgeSec?: number;
}

const DEFAULTS: Required<SuitabilityMinima> = {
  minRwyM: 2000,
  requireHardSurface: true,
  minCeilingFt: 1000,
  minVisM: 3000,
  maxCrosswindKt: 38,
  maxDataAgeSec: 6 * 3600,
};

const M_PER_FT = 0.3048;

/** Best-runway crosswind (kt) for a wind, or null if it can't be computed. */
export function crosswindKt(
  windDirDeg: number | 'VRB' | undefined,
  speedKt: number | undefined,
  runwayHeadingsDeg: number[] | undefined,
): { xwKt: number; rwyHeadingDeg: number } | null {
  if (windDirDeg === 'VRB' || windDirDeg == null || speedKt == null) return null;
  if (!runwayHeadingsDeg || runwayHeadingsDeg.length === 0) return null;
  let best: { xwKt: number; rwyHeadingDeg: number } | null = null;
  for (const hdg of runwayHeadingsDeg) {
    const delta = angleDiffDeg(windDirDeg, hdg); // wind-from relative to runway heading
    const xw = Math.abs(speedKt * Math.sin(toRad(delta)));
    if (!best || xw < best.xwKt) best = { xwKt: xw, rwyHeadingDeg: hdg };
  }
  return best;
}

export function evaluateSuitability(
  facts: SuitabilityFacts,
  minima: SuitabilityMinima = {},
): SuitabilityReport {
  const m = { ...DEFAULTS, ...minima };
  const checks: SuitabilityCheck[] = [];

  // --- runway length (hard) ---
  const minFt = Math.round(m.minRwyM / M_PER_FT);
  if (facts.longestRwyFt == null) {
    checks.push(hard('runway', 'RWY', 'unknown', 'no runway data'));
  } else {
    const ok = facts.longestRwyFt >= minFt;
    checks.push(hard('runway', 'RWY', ok ? 'pass' : 'fail', `${facts.longestRwyFt} ft ${ok ? '>=' : '<'} ${minFt}`));
  }

  // --- surface (hard) ---
  if (m.requireHardSurface) {
    if (facts.hardSurface == null) checks.push(hard('surface', 'SFC', 'unknown', 'surface unknown'));
    else checks.push(hard('surface', 'SFC', facts.hardSurface ? 'pass' : 'fail', facts.hardSurface ? 'hard' : 'not hard surface'));
  }

  // --- validity (hard) ---
  if (facts.withinValidity == null) checks.push(hard('validity', 'VLD', 'unknown', 'validity unknown'));
  else checks.push(hard('validity', 'VLD', facts.withinValidity ? 'pass' : 'fail', facts.withinValidity ? 'in forecast window' : 'outside forecast window'));

  // --- ceiling + visibility (hard) — unknown when there is no forecast ---
  if (!facts.hasForecast) {
    checks.push(hard('ceiling', 'CIG', 'unknown', 'no forecast'));
    checks.push(hard('visibility', 'VIS', 'unknown', 'no forecast'));
  } else {
    if (facts.ceilingFt == null) {
      checks.push(hard('ceiling', 'CIG', 'pass', 'no ceiling'));
    } else {
      const ok = facts.ceilingFt >= m.minCeilingFt;
      checks.push(hard('ceiling', 'CIG', ok ? 'pass' : 'fail', `${facts.ceilingFt} ft ${ok ? '>=' : '<'} ${m.minCeilingFt}`));
    }
    if (facts.visM == null) {
      checks.push(hard('visibility', 'VIS', 'unknown', 'visibility unknown'));
    } else {
      const ok = facts.visM >= m.minVisM;
      checks.push(hard('visibility', 'VIS', ok ? 'pass' : 'fail', `${facts.visM} m ${ok ? '>=' : '<'} ${m.minVisM}`));
    }
  }

  // --- crosswind (advisory) ---
  const speed = facts.gustKt ?? facts.windKt; // conservative: gust if present
  const xw = crosswindKt(facts.windDirDeg, speed, facts.runwayHeadingsDeg);
  if (xw == null) {
    checks.push(adv('crosswind', 'XW', 'unknown', facts.windDirDeg === 'VRB' ? 'wind variable' : 'no runway headings'));
  } else {
    const ok = xw.xwKt <= m.maxCrosswindKt;
    checks.push(adv('crosswind', 'XW', ok ? 'pass' : 'fail', `${Math.round(xw.xwKt)} kt ${ok ? '<=' : '>'} ${m.maxCrosswindKt} (rwy ${Math.round(xw.rwyHeadingDeg / 10).toString().padStart(2, '0')})`));
  }

  // --- data freshness (advisory) ---
  if (facts.dataAgeSec == null) {
    checks.push(adv('dataAge', 'AGE', 'unknown', 'unknown'));
  } else {
    const ok = facts.dataAgeSec <= m.maxDataAgeSec;
    checks.push(adv('dataAge', 'AGE', ok ? 'pass' : 'fail', `${Math.round(facts.dataAgeSec / 60)} min ${ok ? '<=' : '>'} ${Math.round(m.maxDataAgeSec / 60)}`));
  }

  return { verdict: verdictOf(checks), checks, reasons: reasonsOf(checks) };
}

function hard(key: SuitabilityCheck['key'], label: string, status: CheckStatus, detail: string): SuitabilityCheck {
  return { key, label, status, severity: 'hard', detail };
}
function adv(key: SuitabilityCheck['key'], label: string, status: CheckStatus, detail: string): SuitabilityCheck {
  return { key, label, status, severity: 'advisory', detail };
}

function verdictOf(checks: SuitabilityCheck[]): Verdict {
  if (checks.some((c) => c.severity === 'hard' && c.status === 'fail')) return 'NOGO';
  if (checks.some((c) => c.severity === 'hard' && c.status === 'unknown')) return 'UNKNOWN';
  if (checks.some((c) => c.severity === 'advisory' && c.status === 'fail')) return 'CAUTION';
  return 'GO';
}

function reasonsOf(checks: SuitabilityCheck[]): string[] {
  return checks
    .filter((c) => (c.severity === 'hard' && c.status !== 'pass') || (c.severity === 'advisory' && c.status === 'fail'))
    .map((c) => `${c.label}: ${c.detail}`);
}
