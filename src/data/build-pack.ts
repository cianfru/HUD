/**
 * On-device briefing-pack assembly — the "tell it where I'm going" step.
 *
 * Two inputs, one output (a BriefingPack the app flies from):
 *  - packFromOfp(text): paste the OFP. Idents AND weather come from the OFP, so
 *    this is fully OFFLINE (positions/runways from the bundled airport DB).
 *  - packFromRoute(dep, dest, alts): type a few idents. En-route alternates are
 *    auto-added from the corridor of the route; weather is fetched live (needs
 *    connectivity on the ground).
 */
import { extractOfp } from './ofp.js';
import { dbAirport, corridorAlternates } from './airport-db.js';
import type { BriefingPack, BriefingAirport, BriefingWx } from './briefing.js';

export interface BuiltFlight {
  pack: BriefingPack;
  /** Origin/destination idents, for building the route + arrival ETA. */
  adep?: string;
  ades?: string;
}

function uniq(ids: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw?.toUpperCase();
    if (id && /^[A-Z]{4}$/.test(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** Build a pack from a pasted OFP — offline (OFP carries idents + weather). */
export function packFromOfp(ofpText: string, at: Date = new Date()): BuiltFlight {
  const x = extractOfp(ofpText, { isAirport: (id) => !!dbAirport(id) });
  const idents = uniq([
    x.adep,
    x.ades,
    x.takeoffAlternate,
    ...x.destAlternates,
    ...x.enrouteAlternates,
    ...x.allAirports,
  ]);
  const airports = idents.map(dbAirport).filter((a): a is BriefingAirport => !!a);
  const have = new Set(airports.map((a) => a.ident));
  const wxByIdent = new Map(x.airports.map((a) => [a.ident, a]));
  const weather: BriefingWx[] = airports.map((a) => {
    const w = wxByIdent.get(a.ident);
    return { ident: a.ident, metarRaw: w?.metarRaw, tafRaw: w?.tafRaw };
  });
  const pack: BriefingPack = {
    version: 1,
    createdAt: at.toISOString(),
    route: idents.filter((id) => have.has(id)).join(' '),
    airports,
    weather,
  };
  return { pack, adep: x.adep, ades: x.ades };
}

/**
 * Build a pack from typed dep/dest/alternates. En-route alternates are added
 * from the route corridor; weather is fetched from `wxBase`/api/wx when given.
 */
export async function packFromRoute(
  dep: string,
  dest: string,
  alternates: string[] = [],
  opts: { wxBase?: string; at?: Date; maxOffsetNm?: number } = {},
): Promise<BuiltFlight> {
  const at = opts.at ?? new Date();
  const depA = dbAirport(dep);
  const destA = dbAirport(dest);
  const base = uniq([dep, dest, ...alternates]);
  const exclude = new Set(base);
  const corridor =
    depA && destA
      ? corridorAlternates(depA, destA, { maxOffsetNm: opts.maxOffsetNm, exclude }).map((a) => a.ident)
      : [];
  const idents = uniq([...base, ...corridor]);
  const airports = idents.map(dbAirport).filter((a): a is BriefingAirport => !!a);

  let weather: BriefingWx[] = airports.map((a) => ({ ident: a.ident }));
  if (opts.wxBase) {
    try {
      weather = await fetchWeather(opts.wxBase, airports.map((a) => a.ident));
    } catch (e) {
      console.warn('[build-pack] weather fetch failed; pack has no weather:', e);
    }
  }

  const pack: BriefingPack = {
    version: 1,
    createdAt: at.toISOString(),
    route: [dep.toUpperCase(), dest.toUpperCase()].join(' '),
    airports,
    weather,
  };
  return { pack, adep: dep.toUpperCase(), ades: dest.toUpperCase() };
}

/**
 * Fetch fresh METAR/TAF for a pack's fields and freeze it in — the "fetch latest
 * weather before departure" step. Updates createdAt so age/validity reset. Runs
 * on the ground (needs connectivity); the result is what you consult in flight.
 */
export async function refreshWeather(
  pack: BriefingPack,
  wxBase: string,
  at: Date = new Date(),
): Promise<BriefingPack> {
  const weather = await fetchWeather(wxBase, pack.airports.map((a) => a.ident));
  return { ...pack, createdAt: at.toISOString(), weather };
}

/** Fetch METAR/TAF via the /api/wx proxy and map to BriefingWx. */
async function fetchWeather(wxBase: string, idents: string[]): Promise<BriefingWx[]> {
  const url = `${wxBase.replace(/\/$/, '')}/api/wx?ids=${idents.join(',')}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`wx ${r.status}`);
  const data = (await r.json()) as {
    metars?: Array<{ icaoId: string; rawOb?: string; obsTime?: number }>;
    tafs?: Array<{ icaoId: string; rawTAF?: string }>;
  };
  const metar = new Map((data.metars ?? []).map((m) => [m.icaoId, m]));
  const taf = new Map((data.tafs ?? []).map((t) => [t.icaoId, t.rawTAF]));
  return idents.map((id) => ({
    ident: id,
    metarRaw: metar.get(id)?.rawOb,
    metarObsSec: metar.get(id)?.obsTime,
    tafRaw: taf.get(id),
  }));
}
