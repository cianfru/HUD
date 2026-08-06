/**
 * OFP (Operational Flight Plan) extraction.
 *
 * An airline OFP is a dense, multi-page PDF, but the offline briefing pack only
 * needs one thing from it: the AIRPORT SET — origin, destination, the takeoff
 * and destination alternates, and (the reason this product exists) the ETOPS /
 * EDTO en-route alternates, which sit far off the centerline.
 *
 * We do NOT parse the whole document. We anchor on the labels that introduce
 * those fields and pull the 4-letter ICAO idents near them, validating each
 * against a real airport database so dense non-airport tokens (WIND, MORA,
 * FUEL, city names...) can never masquerade as a field. Dispatch-vendor layouts
 * vary; anchored extraction + DB validation degrades gracefully rather than
 * breaking on a format it hasn't seen.
 *
 * The ICAO field-15 route string (between ADEP and ADES) is standardized, so we
 * capture it best-effort for context. Expanding its airways to fix coordinates
 * needs a navdata source and is deliberately left to the caller.
 */

export interface OfpExtract {
  adep?: string;
  ades?: string;
  takeoffAlternate?: string;
  destAlternates: string[];
  /** ETOPS / EDTO / ERA "adequate" en-route alternates. */
  enrouteAlternates: string[];
  /** Every distinct airport ident found anywhere, in order of appearance. */
  allAirports: string[];
  /** Raw ICAO field-15 route tokens, if a route line was located. */
  routeTokens: string[];
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

type Category = 'takeoff' | 'enroute' | 'destAltn' | 'ades' | 'adep' | null;

// Label words that are 4 uppercase letters and would otherwise look like idents.
const LABEL_WORDS = new Set([
  'ALTN', 'ALTS', 'DEST', 'ADEP', 'ADES', 'TKOF', 'ENRT', 'ETOP', 'EDTO', 'ETPS',
  'ROUTE', 'RTES', 'DEPT', 'ARR', 'ORIG', 'FROM', 'INTL', 'ADEQ', 'TAXI', 'TRIP',
  'FUEL', 'WIND', 'TEMP', 'MORA', 'TRUE', 'MACH', 'DIST', 'TIME', 'ZONE', 'ZFWT',
  'TOW', 'LDW', 'PLAN', 'PROG', 'CLMB', 'DESC', 'GATE', 'ELEV', 'FREQ', 'IDNT',
]);

// Ident optionally annotated with a runway, e.g. OTHH/16R or OTHH16L.
const IDENT_RE = /\b([A-Z]{4})(?:\/?\d{2}[LRC]?)?\b/g;
const RWY_PAIR_RE = /\b([A-Z]{4})\/\d{2}[LRC]?\b/g;

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

function classify(line: string): Category {
  const u = line.toUpperCase();
  // Specific alternates first so "TKOF ALTN" / "ENRT ALTN" don't fall through
  // to the generic ALTN rule.
  if (/\b(TKOF|T\/?O|TAKE\s?-?OFF|DEP(ARTURE)?)\b[^A-Z]*\b(ALTN|ALT|ALTERNATE)\b/.test(u))
    return 'takeoff';
  if (/\b(ETOPS?|EDTO|EN[\s-]?RT|EN[\s-]?ROUTE|ERA|ADEQUATE)\b/.test(u)) return 'enroute';
  if (/\b(DEST(INATION)?\s+)?(ALTN|ALTERNATE)\b/.test(u)) return 'destAltn';
  if (/\b(ADES|DEST(INATION)?|ARR(IVAL)?)\b/.test(u)) return 'ades';
  if (/\b(ADEP|ORIG(IN)?|DEP(ARTURE)?|FROM)\b/.test(u)) return 'adep';
  return null;
}

export function extractOfp(text: string, opts: OfpOptions = {}): OfpExtract {
  const isAirport = opts.isAirport;
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const out: OfpExtract = {
    destAlternates: [],
    enrouteAlternates: [],
    allAirports: [],
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
    if (!arr.includes(id)) arr.push(id);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line) continue;
    let idents = pullIdents(line, isAirport);
    for (const id of idents) addAll(id);

    const cat = classify(line);
    if (!cat) {
      maybeRoute(line, out);
      continue;
    }
    // A label can sit on its own line with the idents just beneath it.
    if (idents.length === 0 && i + 1 < lines.length) {
      const next = pullIdents(lines[i + 1]!, isAirport);
      for (const id of next) addAll(id);
      idents = next;
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
  if (out.enrouteAlternates.length === 0)
    out.warnings.push('no ETOPS/en-route alternates found — check the OFP label style');

  return out;
}

/** Best-effort ICAO field-15 capture from a labeled ROUTE line. */
function maybeRoute(line: string, out: OfpExtract): void {
  if (out.routeTokens.length) return;
  const m = line.match(/\b(?:ATS\s*)?(?:RTE|ROUTE|FPL)\b[:\s]+(.+)$/i);
  if (!m) return;
  const body = m[1]!.trim();
  // A real field-15 body has DCT or airway tokens; ignore prose lines.
  if (!/\bDCT\b|\b[A-Z]\d{1,3}\b|\b[A-Z]{5}\b/.test(body)) return;
  out.routeTokens = body.split(/\s+/).filter(Boolean);
}
