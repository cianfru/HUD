/**
 * Sim-reference cards — content model + loader.
 *
 * Airline sim prep comes as a dense, fixed-grid "evaluation" sheet per exercise.
 * Those sheets are often image-only (no text layer) and internal, so we do NOT
 * parse them: an AI model converts a sheet into the JSON shape below (numbers
 * entered exactly, unreadable fields left null), and the app renders a small
 * deck of glance-cards from it. This file defines that interchange shape and a
 * loader; see docs/sim-content-format.md for the schema + conversion prompt.
 *
 * IMPORTANT: the data bundled here is a SYNTHETIC example only. Real evaluation
 * content is airline-internal — load it at runtime (imported on the device,
 * stored locally) so it never enters source control.
 */
export interface Apt {
  ident: string;
  rwy?: string;
  atis?: string;
  del?: string;
  gnd?: string;
  twr?: string;
  dep?: string;
  app?: string;
  elev?: string;
  msa?: string;
  ta?: string;
  tl?: string;
}

export interface SimEventItem {
  phase: string;
  text: string;
  /** The injected failure / the trap — surfaced first on the events card. */
  warn?: boolean;
}

export interface SimEval {
  ac: string;
  no: number;
  title: string;
  /** City pair, e.g. "LOWW-EDDM". */
  pair: string;
  callsign: string;
  /** Pilot flying for the exercise: "FO" / "CP". */
  pf: string;
  setup: {
    dep: string;
    dest: string;
    wind?: string;
    qnh?: string;
    rwyCond?: string;
    zfw?: string;
    tow?: string;
    crzLvl?: string;
    flap?: string;
    v2?: string;
    simPrep?: string;
  };
  dep: Apt;
  arr: Apt;
  ops: { mel?: string; notam?: string; rte?: string; clearance?: string };
  events: SimEventItem[];
}

export interface SimEvalSet {
  /** Free-text label, e.g. "A320 Recurrent Cycle N". */
  name: string;
  evals: SimEval[];
}

/**
 * SYNTHETIC example — fictional idents/scenarios, structurally identical to a
 * real sheet. This is what ships in the repo; real content is loaded at runtime.
 */
export const SAMPLE_SET: SimEvalSet = {
  name: 'SAMPLE — Recurrent (example)',
  evals: [
    {
      ac: 'A320',
      no: 1,
      title: 'ENGINE FAILURE AFTER V1 (EXAMPLE)',
      pair: 'LOWW-EDDM',
      callsign: 'SAMPLE01',
      pf: 'FO',
      setup: {
        dep: 'LOWW/29',
        dest: 'EDDM/26R',
        wind: '250/10',
        qnh: '1013',
        rwyCond: 'DRY',
        zfw: '58.0',
        tow: '70.5',
        crzLvl: 'FL350',
        flap: '1+F',
        v2: '145',
        simPrep: 'T/O',
      },
      dep: {
        ident: 'LOWW',
        rwy: '29',
        atis: '122.125',
        del: '121.750',
        gnd: '121.600',
        twr: '119.400',
        dep: '123.730',
        elev: '600',
        msa: '4700',
        ta: '10000',
        tl: 'FL130',
      },
      arr: {
        ident: 'EDDM',
        rwy: '26R',
        atis: '123.125',
        del: '121.775',
        twr: '120.500',
        app: '128.025',
        elev: '1487',
        msa: '6500',
        ta: '5000',
        tl: 'FL070',
      },
      ops: {
        mel: '(example) none',
        notam: '(example) none',
        rte: 'LOWW BENED1W BENOT UL725 NARKA T163 ROKIL EDDM',
        clearance: 'SAMPLE01 EDDM BENED1W RWY29 SQ1000',
      },
      events: [
        { phase: 'T/O', text: 'Take-off Runway 29' },
        { phase: 'V1', text: 'Engine failure just after V1 — continue', warn: true },
        { phase: 'CLIMB', text: 'EO SID, clean up, ECAM actions' },
        { phase: 'APPR', text: 'Single-engine radar vectors ILS 26R' },
        { phase: 'LDG', text: 'Single-engine landing, exercise complete' },
      ],
    },
  ],
};

// Minimal runtime validation so imported JSON can't render garbage silently.
export function isSimEvalSet(x: unknown): x is SimEvalSet {
  if (!x || typeof x !== 'object') return false;
  const s = x as SimEvalSet;
  return typeof s.name === 'string' && Array.isArray(s.evals) && s.evals.every(isSimEval);
}

function isSimEval(x: unknown): x is SimEval {
  if (!x || typeof x !== 'object') return false;
  const e = x as SimEval;
  return (
    typeof e.no === 'number' &&
    typeof e.title === 'string' &&
    !!e.setup &&
    !!e.dep &&
    !!e.arr &&
    Array.isArray(e.events)
  );
}

/**
 * Content to render: imported JSON from local storage if present and valid,
 * otherwise the synthetic sample. Real content is imported on the device (see
 * the webview panel) and stored under this key — it never enters the repo.
 */
export const CONTENT_KEY = 'simref.content';

export function loadContent(): SimEvalSet {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CONTENT_KEY) : null;
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isSimEvalSet(parsed)) return parsed;
      console.warn('[simref] stored content failed validation — using sample');
    }
  } catch (e) {
    console.warn('[simref] could not read stored content:', e);
  }
  return SAMPLE_SET;
}
