/**
 * Sim-reference cards.
 *
 * Airline sim prep comes as a dense, fixed-grid "evaluation" sheet per exercise
 * (setup strip · airport data · ops · a timeline of events · arrival). Those
 * sheets are photos with no text layer, and an A4 grid can't be shrunk onto a
 * 576x288 monochrome display and stay readable — so we model each evaluation as
 * DATA and render a small deck of glance-cards from it. This is the typed shape
 * a card is filled from (by hand each cycle, or OCR-then-verify); it is not an
 * operational document and carries no authority.
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
  /** City pair, e.g. "OMDB-OOMS". */
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

// Hand-modelled from the real A350 Recurrent Cycle 3 prep (Figures B-9, B-10).
export const A350_CYCLE3: SimEval[] = [
  {
    ac: 'A350',
    no: 1,
    title: 'LOSS OF INSTRUMENTATION',
    pair: 'OMDB-OOMS',
    callsign: 'QTR21S',
    pf: 'FO',
    setup: {
      dep: 'OMDB/12R',
      dest: 'OOMS/08R',
      wind: '180/15',
      qnh: '1000',
      rwyCond: 'DRY',
      zfw: '190.0',
      tow: '200.8',
      crzLvl: 'FL250',
      flap: 'CREW',
      simPrep: 'GATE',
    },
    dep: {
      ident: 'OMDB',
      rwy: '12R',
      atis: '126.275',
      del: '120.35',
      gnd: '118.35',
      twr: '119.55',
      dep: '121.025',
      elev: '62',
      msa: '3800',
      ta: '13000',
      tl: 'FL150',
    },
    arr: {
      ident: 'OOMS',
      rwy: '08R',
      atis: '126.8',
      del: '125.575',
      twr: '118.4',
      app: '121.2',
      elev: '49',
      msa: '9100',
      ta: '13000',
      tl: 'FL150',
    },
    ops: {
      mel: '36-11-01A ENG BLEED AIR SYS 1',
      notam: 'OMDB RWY 12L CLSD',
      rte: 'OMDB 12R ANVI5G ANVIX L223 TARDI N629 IVAKU G216 MCT OOMS 08R',
      clearance: 'QTR21S OOMS ANVI5G RWY12R SQ3330 DEP 121.025',
    },
    events: [
      { phase: 'T/O', text: 'CTOT STD+30. Line-up 12R via K1, cleared T/O' },
      { phase: 'CLIMB', text: 'Contact Dubai DEP 121.025. Unrestricted FL210, spd 310+' },
      { phase: 'ACTIVATE', text: 'Between 10000 FT and FL150' },
      { phase: 'CAE', text: 'Autoflight - AFS CTL PNL FAULT (FCU 1+2 FAULT)', warn: true },
      { phase: 'APPR', text: 'Vectors for selected rwy/approach' },
      { phase: 'LDG', text: 'Sim complete incapacitation passing 100 KTS' },
    ],
  },
  {
    ac: 'A350',
    no: 2,
    title: 'MNGMT OF CONSEQUENCES',
    pair: 'OMDB-VABB',
    callsign: 'QTR21S',
    pf: 'CP',
    setup: {
      dep: 'OMDB/12R',
      dest: 'VABB/27',
      wind: '180/15',
      qnh: '1000',
      rwyCond: 'DRY',
      zfw: '190.0',
      tow: '214.8',
      crzLvl: 'FL390',
      flap: '1+F',
      v2: '153',
      simPrep: 'T/O',
    },
    dep: {
      ident: 'OMDB',
      rwy: '12R',
      atis: '126.275',
      del: '120.35',
      gnd: '118.35',
      twr: '119.55',
      dep: '121.025',
      elev: '62',
      msa: '3800',
      ta: '13000',
      tl: 'FL150',
    },
    arr: {
      ident: 'VABB',
      rwy: '27',
      atis: '126.4',
      del: '121.85',
      gnd: '121.9',
      twr: '118.1',
      app: '127.9',
      elev: '40',
      msa: '3800',
      ta: '6000',
      tl: 'FL80',
    },
    ops: {
      mel: '36-11-01A ENG BLEED AIR SYS 1',
      notam: 'OMDB RWY 12L CLSD',
      rte: 'OMDB 12R ANVI5G ANVIX L223 TARDI N629 GIDAN N881 RASKI L301 KARKU M638 EXOLU POKON POKO2A VABB 27',
      clearance: 'QTR21S VABB ANVI5G RWY12R SQ3330 DEP 121.025',
    },
    events: [
      { phase: 'T/O', text: 'Take-off Runway 12R' },
      { phase: 'CLIMB', text: 'Contact Dubai DEP 121.025. Via SID FL210, expedite thru FL150' },
      { phase: 'ACTIVATE', text: 'Between 8000 FT and 12000 FT' },
      { phase: 'CAE', text: 'Pneumatic - WING LEAK RIGHT', warn: true },
      { phase: 'G/A', text: '2000 AAL FAIL ILS LOC. If continue: G/A + vectors, ILS or RNP', warn: true },
      { phase: 'LDG', text: 'Exercise complete after landing' },
    ],
  },
];
