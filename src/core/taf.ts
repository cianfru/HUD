/**
 * Offline TAF engine.
 *
 * Because the fleet has no in-flight connectivity, diversion suitability in
 * cruise is judged from the TAF that was cached on the ground — a *forecast*
 * valid across the whole A320 sector. This module parses a raw TAF, resolves the
 * prevailing (and any TEMPO/PROB) conditions at a given time, and maps them to a
 * flight category / go-no-go. It is pure and dependency-light so it runs with no
 * network and is fully unit-testable.
 *
 * Scope: the common ICAO tokens that drive a category — wind, visibility
 * (metres, 9999, CAVOK, or SM), and ceiling (lowest BKN/OVC/VV). Weather
 * phenomena are captured raw but don't yet change the category. This is a
 * situational-awareness aid, NOT a dispatch tool.
 */
export type FltCat = 'VFR' | 'MVFR' | 'IFR' | 'LIFR' | 'UNKN';

export interface Conditions {
  windDirDeg?: number | 'VRB';
  windKt?: number;
  gustKt?: number;
  /** Prevailing visibility in metres (10000 == "10 km or more"). */
  visM?: number;
  /** Ceiling (lowest BKN/OVC/VV) in feet AGL; undefined = no ceiling. */
  ceilingFt?: number;
  cavok?: boolean;
  raw: string;
}

type ChangeKind = 'FM' | 'BECMG' | 'TEMPO' | 'PROB';
export interface TafChange {
  kind: ChangeKind;
  prob?: number;
  /** When this change starts to apply. */
  from: Date;
  /** When it stops applying (permanent changes: to end of validity / next FM). */
  to: Date;
  /** For BECMG, the time the transition completes (conditions permanent after). */
  effective: Date;
  cond: Conditions;
}

export interface Taf {
  station: string;
  issued: Date;
  validFrom: Date;
  validTo: Date;
  base: Conditions;
  changes: TafChange[];
  raw: string;
}

const M_PER_SM = 1609.34;

/** Parse a raw TAF. `ref` supplies year/month for the day-of-month tokens. */
export function parseTaf(raw: string, ref: Date = new Date()): Taf | null {
  const text = raw.replace(/\s+/g, ' ').trim().replace(/=$/, '');
  const m = text.match(/^TAF(?:\s+(?:AMD|COR))?\s+([A-Z]{4})\s+(\d{2})(\d{2})(\d{2})Z\s+(\d{2})(\d{2})\/(\d{2})(\d{2})\s+(.*)$/);
  if (!m) return null;
  const [, station, iDay, iHr, iMin, vfDay, vfHr, vtDay, vtHr, rest] = m;
  const issued = resolve(+iDay!, +iHr!, +iMin!, ref);
  const validFrom = resolve(+vfDay!, +vfHr!, 0, ref);
  const validTo = resolve(+vtDay!, +vtHr!, 0, ref);

  // Split the body into the base group and the change groups.
  const tokens = rest!.split(' ');
  const groups: string[][] = [[]];
  for (const tok of tokens) {
    if (/^(FM\d{6}|BECMG|TEMPO|PROB\d{2}|INTER)$/.test(tok) || (tok === 'PROB' )) {
      groups.push([tok]);
    } else {
      groups[groups.length - 1]!.push(tok);
    }
  }

  const base = parseConditions(groups[0]!.join(' '));
  const changes: TafChange[] = [];
  for (let i = 1; i < groups.length; i++) {
    const g = groups[i]!;
    const head = g[0]!;
    let kind: ChangeKind;
    let prob: number | undefined;
    let idx = 1;
    let from: Date;
    let to: Date;

    if (head.startsWith('FM')) {
      kind = 'FM';
      from = resolve(+head.slice(2, 4), +head.slice(4, 6), +head.slice(6, 8), ref);
      to = validTo;
    } else {
      if (head.startsWith('PROB')) {
        prob = +head.slice(4, 6);
        // A PROB may be followed by TEMPO; the next token or same group holds the window.
        kind = g[1] === 'TEMPO' ? (idx++, 'TEMPO') : 'PROB';
      } else {
        kind = head as ChangeKind; // BECMG | TEMPO
      }
      const win = g[idx]?.match(/^(\d{2})(\d{2})\/(\d{2})(\d{2})$/);
      if (!win) continue;
      idx++;
      from = resolve(+win[1]!, +win[2]!, 0, ref);
      to = resolve(+win[3]!, +win[4]!, 0, ref);
    }
    const cond = parseConditions(g.slice(idx).join(' '));
    changes.push({ kind, prob, from, to, effective: kind === 'BECMG' ? to : from, cond });
  }

  return { station: station!, issued, validFrom, validTo, base, changes, raw: text };
}

/** Prevailing conditions at `at`, plus any active TEMPO/PROB groups. */
export function conditionsAt(taf: Taf, at: Date): { prevailing: Conditions; tempo: TafChange[] } {
  let prevailing: Conditions = { ...taf.base };
  const permanent = taf.changes
    .filter((c) => c.kind === 'FM' || c.kind === 'BECMG')
    .filter((c) => c.effective.getTime() <= at.getTime())
    .sort((a, b) => a.effective.getTime() - b.effective.getTime());
  for (const c of permanent) {
    prevailing = c.kind === 'FM' ? { ...c.cond } : overlay(prevailing, c.cond);
  }
  const tempo = taf.changes.filter(
    (c) => (c.kind === 'TEMPO' || c.kind === 'PROB') && c.from.getTime() <= at.getTime() && at.getTime() <= c.to.getTime(),
  );
  return { prevailing, tempo };
}

export interface Assessment {
  category: FltCat;
  suitable: boolean;
  prevailing: Conditions;
  /** Worst active TEMPO/PROB category, if it is worse than prevailing. */
  tempoCategory?: FltCat;
  withinValidity: boolean;
}

export interface Minima {
  /** Below this flight category = not suitable. Default: LIFR is not suitable. */
  worstAcceptable?: FltCat;
}

const CAT_ORDER: FltCat[] = ['LIFR', 'IFR', 'MVFR', 'VFR'];

/** Assess suitability at `at` from the cached forecast. */
export function assessTaf(taf: Taf, at: Date, minima: Minima = {}): Assessment {
  const withinValidity = at.getTime() >= taf.validFrom.getTime() && at.getTime() <= taf.validTo.getTime();
  const { prevailing, tempo } = conditionsAt(taf, at);
  const category = flightCategory(prevailing);
  const worstAcceptable = minima.worstAcceptable ?? 'IFR';
  const tempoCats = tempo.map((t) => flightCategory(t.cond)).filter((c) => c !== 'UNKN');
  const tempoWorst = worstOf(tempoCats);
  const suitable =
    withinValidity && category !== 'UNKN' && catRank(category) >= catRank(worstAcceptable);
  return {
    category,
    suitable,
    prevailing,
    tempoCategory: tempoWorst && catRank(tempoWorst) < catRank(category) ? tempoWorst : undefined,
    withinValidity,
  };
}

export function flightCategory(c: Conditions): FltCat {
  if (c.cavok) return 'VFR';
  const visSm = c.visM != null ? c.visM / M_PER_SM : undefined;
  const ceil = c.ceilingFt;
  if (visSm == null && ceil == null) return 'UNKN';
  const lowVis = visSm ?? 99;
  const lowCeil = ceil ?? 99999;
  if (lowCeil < 500 || lowVis < 1) return 'LIFR';
  if (lowCeil < 1000 || lowVis < 3) return 'IFR';
  if (lowCeil < 3000 || lowVis < 5) return 'MVFR';
  return 'VFR';
}

// --- token parsing -------------------------------------------------------

function parseConditions(s: string): Conditions {
  const cond: Conditions = { raw: s.trim() };
  const toks = s.split(' ').filter(Boolean);
  for (const t of toks) {
    let mm: RegExpMatchArray | null;
    if (t === 'CAVOK') {
      cond.cavok = true;
      cond.visM = 10000;
      continue;
    }
    if ((mm = t.match(/^(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?(KT|MPS)$/))) {
      cond.windDirDeg = mm[1] === 'VRB' ? 'VRB' : +mm[1]!;
      const unit = mm[4] === 'MPS' ? 1.94384 : 1;
      cond.windKt = Math.round(+mm[2]! * unit);
      if (mm[3]) cond.gustKt = Math.round(+mm[3] * unit);
      continue;
    }
    if (/^\d{4}$/.test(t)) {
      cond.visM = +t === 9999 ? 10000 : +t;
      continue;
    }
    if ((mm = t.match(/^(P?)(\d{1,2})(?:\/(\d))?SM$/)) || (mm = t.match(/^M(\d)\/(\d)SM$/))) {
      cond.visM = parseSm(t);
      continue;
    }
    if ((mm = t.match(/^(FEW|SCT|BKN|OVC|VV)(\d{3})(CB|TCU)?$/))) {
      if (mm[1] === 'BKN' || mm[1] === 'OVC' || mm[1] === 'VV') {
        const ft = +mm[2]! * 100;
        if (cond.ceilingFt == null || ft < cond.ceilingFt) cond.ceilingFt = ft;
      }
      continue;
    }
    if (/^(NSC|NCD|SKC|CLR|NSW)$/.test(t)) continue;
  }
  return cond;
}

function parseSm(t: string): number {
  const m = t.match(/^P?(\d{1,2})(?:\s|)(?:(\d)\/(\d))?SM$/);
  if (t.startsWith('P')) return 10 * M_PER_SM; // "6+"
  const frac = t.match(/^M?(\d)\/(\d)SM$/);
  if (frac) return (+frac[1]! / +frac[2]!) * M_PER_SM;
  const whole = t.match(/^(\d{1,2})SM$/);
  if (whole) return +whole[1]! * M_PER_SM;
  if (m) return +(m[1] ?? 0) * M_PER_SM;
  return 10 * M_PER_SM;
}

function overlay(base: Conditions, c: Conditions): Conditions {
  const out: Conditions = { ...base, raw: c.raw };
  if (c.windKt != null) {
    out.windDirDeg = c.windDirDeg;
    out.windKt = c.windKt;
    out.gustKt = c.gustKt;
  }
  if (c.visM != null) out.visM = c.visM;
  if (c.cavok) {
    out.cavok = true;
    out.visM = 10000;
    out.ceilingFt = undefined;
  }
  if (c.ceilingFt != null || /\b(NSC|NCD|SKC|CLR)\b/.test(c.raw)) out.ceilingFt = c.ceilingFt;
  return out;
}

/** Resolve a day-of-month/hour(/min) token to an absolute UTC Date near `ref`. */
function resolve(day: number, hour: number, min: number, ref: Date): Date {
  let addDay = 0;
  let h = hour;
  if (h === 24) {
    h = 0;
    addDay = 1;
  }
  const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), day, h, min, 0));
  // Handle month wrap: a day well before the reference day is next month.
  if (day < ref.getUTCDate() - 20) d.setUTCMonth(d.getUTCMonth() + 1);
  if (addDay) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

function catRank(c: FltCat): number {
  const i = CAT_ORDER.indexOf(c);
  return i < 0 ? -1 : i;
}
function worstOf(cats: FltCat[]): FltCat | undefined {
  let worst: FltCat | undefined;
  for (const c of cats) if (!worst || catRank(c) < catRank(worst)) worst = c;
  return worst;
}
