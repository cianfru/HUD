/**
 * OFP (Operational Flight Plan) extraction.
 *
 * An airline OFP is a dense, multi-page PDF, but the offline briefing pack only
 * needs one thing from it: the AIRPORT SET — origin, destination, the takeoff
 * and destination alternates, and (for long sectors) the ETOPS / EDTO en-route
 * alternates, which sit far off the centerline.
 *
 * We do NOT parse the whole document. Real dispatch OFPs come in two shapes and
 * we handle both:
 *
 *  1. SUMMARY line  — e.g. Lido/QR: "ROUTE: OTHH - OMSJ ALTN:OOMS OTHH".
 *     One line gives origin, destination and the destination alternates.
 *  2. WEATHER SECTIONS — "DEPARTURE AIRPORT", "DESTINATION AIRPORT",
 *     "DESTINATION ALTERNATE", "ENROUTE AIRPORT(S)" — each followed by the
 *     airports in that role as "ICAO/IATA  NAME", with the METAR (SA) and TAF
 *     (FT) printed inline beneath each one.
 *
 * Because the OFP embeds the TAFs, a pack can be built from the PDF ALONE — no
 * network at all. Every ident is still validated against a real airport
 * database so dense non-airport tokens (WIND, MORA, weather codes, city names)
 * can never masquerade as a field. A generic anchored scan handles inline-style
 * OFPs ("ETOPS ALTN OMAA OOMS ...") that don't use the section layout.
 */

export type OfpRole = 'adep' | 'ades' | 'takeoff' | 'dest-altn' | 'enroute';

export interface OfpAirport {
  ident: string;
  name?: string;
  role: OfpRole;
  /** METAR reconstructed from the OFP's inline "SA" line, if present. */
  metarRaw?: string;
  /** TAF reconstructed from the OFP's inline "FT"/"FC" block, if present. */
  tafRaw?: string;
}

export interface OfpExtract {
  adep?: string;
  ades?: string;
  takeoffAlternate?: string;
  destAlternates: string[];
  /** ETOPS / EDTO / ERA / en-route "adequate" alternates. */
  enrouteAlternates: string[];
  /** Every distinct airport ident found anywhere, in order of appearance. */
  allAirports: string[];
  /** Per-airport detail incl. inline weather, when the section layout is used. */
  airports: OfpAirport[];
  /** Raw ICAO field-15 route tokens, if a route line was located. */
  routeTokens: string[];
  /** Planned ground distance (NM) from the OFP — the real routed distance,
   *  including detours, not the great-circle dep->dest. Used for ETA. */
  groundDistanceNm?: number;
  /** Planned air distance (NM) — fallback for ETA when ground distance is absent. */
  airDistanceNm?: number;
  warnings: string[];
}

export interface OfpOptions {
  /**
   * True if `id` is a real airport. The linchpin of robust extraction — with a
   * full database wired in, non-airport 4-letter tokens are dropped outright.
   * When omitted, only obvious label words are filtered (looser; for tests wire
   * a real predicate).
   */
  isAirport?: (id: string) => boolean;
}

// Label words that are 4 uppercase letters and would otherwise look like idents.
const LABEL_WORDS = new Set([
  'ALTN', 'ALTS', 'DEST', 'ADEP', 'ADES', 'TKOF', 'ENRT', 'ETOP', 'EDTO', 'ETPS',
  'ROUTE', 'RTES', 'DEPT', 'ARR', 'ORIG', 'FROM', 'INTL', 'ADEQ', 'TAXI', 'TRIP',
  'FUEL', 'WIND', 'TEMP', 'MORA', 'TRUE', 'MACH', 'DIST', 'TIME', 'ZONE', 'ZFWT',
  'PLAN', 'PROG', 'CLMB', 'DESC', 'GATE', 'ELEV', 'FREQ', 'IDNT', 'PROB', 'BECM',
  'TEMO', 'CAVO', 'NOSI', 'NOSG',
]);

// Ident optionally annotated with a runway, e.g. OTHH/16R or OTHH16L.
const IDENT_RE = /\b([A-Z]{4})(?:\/?\d{2}[LRC]?)?\b/g;
const RWY_PAIR_RE = /\b([A-Z]{4})\/\d{2}[LRC]?\b/g;
// A weather-section airport header: "OMSJ/SHJ  SHARJAH INTL".
const AIRPORT_HEADER_RE = /^([A-Z]{4})\/[A-Z0-9]{2,4}\b\s*(.*)$/;

function pullIdents(s: string, isAirport?: (id: string) => boolean): string[] {
  const out: string[] = [];
  IDENT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = IDENT_RE.exec(s))) {
    const id = m[1]!;
    if (LABEL_WORDS.has(id)) continue;
    if (isAirport ? !isAirport(id) : false) continue;
    out.push(id);
  }
  return out;
}

type Category = 'takeoff' | 'enroute' | 'destAltn' | 'ades' | 'adep' | null;

function classify(line: string): Category {
  const u = line.toUpperCase();
  if (/\b(TKOF|T\/?O|TAKE\s?-?OFF|DEP(ARTURE)?)\b[^A-Z]*\b(ALTN|ALT|ALTERNATE)\b/.test(u))
    return 'takeoff';
  if (/\b(ETOPS?|EDTO|EN[\s-]?RT|EN[\s-]?ROUTE|ERA|ADEQUATE)\b/.test(u)) return 'enroute';
  if (/\b(DEST(INATION)?\s+)?(ALTN|ALTERNATE)\b/.test(u)) return 'destAltn';
  if (/\b(ADES|DEST(INATION)?|ARR(IVAL)?)\b/.test(u)) return 'ades';
  if (/\b(ADEP|ORIG(IN)?|DEP(ARTURE)?|FROM)\b/.test(u)) return 'adep';
  return null;
}

/** Section header in the weather block -> the role its airports take. */
function sectionRole(line: string): OfpRole | null {
  const u = line.toUpperCase().replace(/\s+/g, ' ');
  if (/\b(TAKEOFF ALTERNATE|T\/O ALT)/.test(u)) return 'takeoff';
  if (/\b(ETOPS|EDTO|ADEQUATE)/.test(u)) return 'enroute';
  if (/\bEN[\s-]?ROUTE (AIRPORT|ALTERNATE)/.test(u)) return 'enroute';
  if (/\bDESTINATION ALTERNATE/.test(u)) return 'dest-altn';
  if (/\bDESTINATION AIRPORT/.test(u)) return 'ades';
  if (/\bDEPARTURE AIRPORT/.test(u)) return 'adep';
  return null;
}

// Page furniture that interleaves the weather block — skip, do NOT close a
// section (the enroute list continues across page breaks).
const FOOTER_RE = /^(QTR\b.*\bOFP:|Page \d+\s+of\b|===PAGE\b|[A-Z]{3}\s?\d+\/\d+[A-Z])/i;
// Lines that genuinely end the current weather section (strong banners or the
// start of an unrelated major block).
const SECTION_STOP_RE =
  /^(={4,}|\+{4,}|-{4,}|\*{4,})\s*$|\b(DETAILED\s+INFO|RUNWAY|NOTAMS?|GENERAL|FUEL\s+(PLAN|SUMMARY)|SIGWX|TROPOPAUSE|FLIGHT\s+LOG|WIND\/TEMP)\b/i;

export function extractOfp(text: string, opts: OfpOptions = {}): OfpExtract {
  const isAirport = opts.isAirport;
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const out: OfpExtract = {
    destAlternates: [],
    enrouteAlternates: [],
    allAirports: [],
    airports: [],
    routeTokens: [],
    warnings: [],
  };
  const seen = new Set<string>();
  const addAll = (id: string) => {
    if (!seen.has(id)) {
      seen.add(id);
      out.allAirports.push(id);
    }
  };
  const pushUniq = (arr: string[], id: string) => {
    if (id && !arr.includes(id)) arr.push(id);
  };

  parseSummaryRoute(lines, out, isAirport);
  parseDistances(lines, out);
  parseWeatherSections(lines, out, isAirport, addAll, pushUniq);
  // The generic anchored scan is for inline-style OFPs that lack the section
  // layout. Running it over a section-style OFP would sweep in every airport
  // mentioned in the NOTAMs/company pages, so only fall back to it when the
  // section parser found nothing.
  if (out.airports.length === 0) genericAnchorScan(lines, out, isAirport, addAll, pushUniq);

  // Fallback: a runway-annotated city pair on one line, e.g. "OTHH/16R EDDF/25C".
  if (!out.adep || !out.ades) {
    for (const line of lines) {
      const pair = [...line.matchAll(RWY_PAIR_RE)].map((m) => m[1]!);
      const valid = pair.filter((id) => (isAirport ? isAirport(id) : true));
      if (valid.length >= 2) {
        out.adep ??= valid[0];
        out.ades ??= valid[1];
        break;
      }
    }
  }

  if (!out.adep) out.warnings.push('no departure aerodrome (ADEP) found');
  if (!out.ades) out.warnings.push('no destination aerodrome (ADES) found');

  return out;
}

/**
 * Planned route distance from the OFP fuel/summary block: "GND DIST  1883" and
 * "AIR DIST  1879". This is the real routed distance (incl. detours), so ETA
 * scales off it rather than the great-circle dep->dest. Scanned per line so a
 * label can't match a number on a different line; sanity-bounded to NM.
 */
function parseDistances(lines: string[], out: OfpExtract): void {
  const ok = (n: number): number | undefined => (n >= 30 && n <= 20000 ? n : undefined);
  for (const l of lines) {
    if (out.groundDistanceNm == null) {
      const m = l.match(/\b(?:GND|GROUND)\s*DIST\b[^0-9]{0,12}(\d{2,5})/i);
      if (m) out.groundDistanceNm = ok(parseInt(m[1]!, 10));
    }
    if (out.airDistanceNm == null) {
      const m = l.match(/\bAIR\s*DIST\b[^0-9]{0,12}(\d{2,5})/i);
      if (m) out.airDistanceNm = ok(parseInt(m[1]!, 10));
    }
  }
}

/** Lido/QR one-liner: "ROUTE: OTHH - OMSJ ALTN:OOMS OTHH" (+ field-15 beneath). */
function parseSummaryRoute(
  lines: string[],
  out: OfpExtract,
  isAirport?: (id: string) => boolean,
): void {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(/\bROUTE:\s*([A-Z]{4})\s*-\s*([A-Z]{4})(.*)$/);
    if (!m) continue;
    const [, adep, ades, tail] = m;
    if (isAirport && !(isAirport(adep!) && isAirport(ades!))) continue;
    out.adep ??= adep;
    out.ades ??= ades;
    const altn = tail!.match(/ALTN:\s*([A-Z0-9 ]+)/i);
    if (altn) {
      for (const id of altn[1]!.split(/\s+/)) {
        if (/^[A-Z]{4}$/.test(id) && (!isAirport || isAirport(id)) && id !== out.ades) {
          if (!out.destAlternates.includes(id)) out.destAlternates.push(id);
        }
      }
    }
    // The field-15 route usually sits on the next non-empty line.
    const next = lines[i + 1];
    if (next && /\bDCT\b|\b[A-Z]\d{2,4}\b|\b[A-Z]{5}\b/.test(next)) {
      out.routeTokens = next.split(/\s+/).filter(Boolean);
    }
    break;
  }
}

/**
 * Scan the OFP's weather block: section headers open a role, "ICAO/IATA NAME"
 * lines start an airport, and the SA/FT blocks beneath reconstruct METAR/TAF.
 */
function parseWeatherSections(
  lines: string[],
  out: OfpExtract,
  isAirport: ((id: string) => boolean) | undefined,
  addAll: (id: string) => void,
  pushUniq: (arr: string[], id: string) => void,
): void {
  let role: OfpRole | null = null;
  let cur: OfpAirport | null = null;
  let buf: { kind: 'metar' | 'taf'; text: string } | null = null;
  const byIdent = new Map<string, OfpAirport>();

  const closeBuf = () => {
    if (cur && buf) {
      const body = buf.text.replace(/=+\s*$/, '').replace(/\s+/g, ' ').trim();
      if (buf.kind === 'taf' && /^\d{6}\s+\d{4}\/\d{4}/.test(body)) {
        cur.tafRaw = `TAF ${cur.ident} ${body.replace(/^(\d{6})/, '$1Z')}`;
      } else if (buf.kind === 'metar' && /^\d{6}\b/.test(body)) {
        cur.metarRaw = `${cur.ident} ${body.replace(/^(\d{6})/, '$1Z')}`;
      }
    }
    buf = null;
  };

  for (const line of lines) {
    if (FOOTER_RE.test(line)) continue; // page furniture — section spans it
    const newRole = sectionRole(line);
    if (newRole) {
      closeBuf();
      role = newRole;
      cur = null;
      continue;
    }
    if (SECTION_STOP_RE.test(line)) {
      closeBuf();
      role = null;
      cur = null;
      continue;
    }
    if (!role) continue;

    const hdr = line.match(AIRPORT_HEADER_RE);
    if (hdr && (!isAirport || isAirport(hdr[1]!))) {
      closeBuf();
      const ident = hdr[1]!;
      addAll(ident);
      if (byIdent.has(ident)) {
        cur = byIdent.get(ident)!; // same field seen again — keep enriching
      } else {
        cur = { ident, name: hdr[2]!.trim() || undefined, role };
        byIdent.set(ident, cur);
        out.airports.push(cur);
        if (role === 'adep') out.adep ??= ident;
        else if (role === 'ades') out.ades ??= ident;
        else if (role === 'takeoff') out.takeoffAlternate ??= ident;
        else if (role === 'dest-altn') pushUniq(out.destAlternates, ident);
        else if (role === 'enroute') pushUniq(out.enrouteAlternates, ident);
      }
      continue;
    }

    if (!cur) continue;
    // Weather lines: SA = METAR, FT/FC = TAF, then wrapped continuation lines.
    if (/^SA\b/.test(line)) {
      closeBuf();
      buf = { kind: 'metar', text: line.replace(/^SA\b/, '').trim() };
    } else if (/^(FC\/FT|FT|FC|TAF)\b/.test(line)) {
      closeBuf();
      buf = { kind: 'taf', text: line.replace(/^(FC\/FT|FT|FC|TAF)\b/, '').trim() };
    } else if (buf) {
      buf.text += ' ' + line;
    }
    if (buf && /=\s*$/.test(line)) closeBuf();
  }
  closeBuf();
}

/** Generic anchored scan for inline-style OFPs ("ETOPS ALTN OMAA OOMS ..."). */
function genericAnchorScan(
  lines: string[],
  out: OfpExtract,
  isAirport: ((id: string) => boolean) | undefined,
  addAll: (id: string) => void,
  pushUniq: (arr: string[], id: string) => void,
): void {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    let idents = pullIdents(line, isAirport);
    for (const id of idents) addAll(id);

    const cat = classify(line);
    if (!cat) {
      if (!out.routeTokens.length) maybeRoute(line, out);
      continue;
    }
    if (idents.length === 0 && i + 1 < lines.length) {
      idents = pullIdents(lines[i + 1]!, isAirport);
      for (const id of idents) addAll(id);
    }
    if (idents.length === 0) continue;

    switch (cat) {
      case 'takeoff':
        out.takeoffAlternate ??= idents[0];
        break;
      case 'enroute':
        for (const id of idents) pushUniq(out.enrouteAlternates, id);
        break;
      case 'destAltn':
        for (const id of idents) pushUniq(out.destAlternates, id);
        break;
      case 'ades':
        out.ades ??= idents[0];
        break;
      case 'adep':
        out.adep ??= idents[0];
        break;
    }
  }
}

/** Best-effort ICAO field-15 capture from a labeled ROUTE line. */
function maybeRoute(line: string, out: OfpExtract): void {
  const m = line.match(/\b(?:ATS\s*)?(?:RTE|ROUTE|FPL)\b[:\s]+(.+)$/i);
  if (!m) return;
  const body = m[1]!.trim();
  if (!/\bDCT\b|\b[A-Z]\d{1,3}\b|\b[A-Z]{5}\b/.test(body)) return;
  out.routeTokens = body.split(/\s+/).filter(Boolean);
}
