# Sim-reference content format

The glasses **do not parse** your sim sheets. You convert a sheet into the JSON
shape below (with an AI model, or by hand), then paste it into the Sim Reference
webview panel — it is stored on the device only and rendered as glance-cards.
This keeps brittle OCR out of the safety-relevant numbers and works for any
airline's layout.

## The shape (`SimEvalSet`)

```jsonc
{
  "name": "A320 Recurrent Cycle N",          // free-text label
  "evals": [
    {
      "ac": "A320",
      "no": 1,                                 // evaluation number
      "title": "ENGINE FAILURE AFTER V1",      // scenario
      "pair": "OMDB-OOMS",                     // city pair
      "callsign": "QTR21S",
      "pf": "FO",                              // pilot flying: FO | CP
      "setup": {
        "dep": "OMDB/12R", "dest": "OOMS/08R",
        "wind": "180/15", "qnh": "1000", "rwyCond": "DRY",
        "zfw": "190.0", "tow": "200.8", "crzLvl": "FL250",
        "flap": "CREW", "v2": "153", "simPrep": "GATE"
      },
      "dep": {                                 // departure aerodrome
        "ident": "OMDB", "rwy": "12R", "atis": "126.275",
        "del": "120.35", "gnd": "118.35", "twr": "119.55", "dep": "121.025",
        "elev": "62", "msa": "3800", "ta": "13000", "tl": "FL150"
      },
      "arr": {                                 // arrival aerodrome (same fields; add "app")
        "ident": "OOMS", "rwy": "08R", "atis": "126.8",
        "del": "125.575", "twr": "118.4", "app": "121.2",
        "elev": "49", "msa": "9100", "ta": "13000", "tl": "FL150"
      },
      "ops": {
        "mel": "36-11-01A ENG BLEED AIR SYS 1",
        "notam": "OMDB RWY 12L CLSD",
        "rte": "OMDB 12R ANVI5G ... MCT OOMS 08R",
        "clearance": "QTR21S OOMS ANVI5G RWY12R SQ3330 DEP 121.025"
      },
      "events": [                              // timeline, in order
        { "phase": "T/O",      "text": "Line-up 12R via K1, cleared T/O" },
        { "phase": "CLIMB",    "text": "Contact DEP 121.025, unrestricted FL210" },
        { "phase": "ACTIVATE", "text": "Between 10000 FT and FL150" },
        { "phase": "CAE",      "text": "AFS CTL PNL FAULT (FCU 1+2)", "warn": true },
        { "phase": "LDG",      "text": "Sim incapacitation passing 100 KTS" }
      ]
    }
  ]
}
```

Rules that keep it safe:

- **Every value is a string** (so `"1013"`, `"FL350"`, `"180/15"` all round-trip).
- **Omit** a field you don't have; **never invent** one.
- `warn: true` marks the injected failure / the trap — it renders first with a
  `>>` prefix (the firmware font has no warning glyph).
- Keep `events` in chronological order; the deck shows them as one card.

## Conversion prompt (paste into any AI model, with the sheet)

> You convert an airline sim **evaluation sheet** into JSON matching the
> `SimEvalSet` TypeScript interface I give you. Output **only** valid JSON, no
> prose.
>
> Hard rules:
> - Transcribe every number/frequency **exactly** as printed. Do **not** compute,
>   round, or infer.
> - If a value is unreadable or absent, **omit that key** — never guess.
> - Every value is a **string**.
> - Put the injected failure and any "trap" instruction as an event with
>   `"warn": true`.
> - Keep events in chronological order.
>
> Interface:
> ```ts
> interface SimEvalSet { name: string; evals: SimEval[] }
> interface SimEval { ac: string; no: number; title: string; pair: string;
>   callsign: string; pf: string;
>   setup: { dep: string; dest: string; wind?: string; qnh?: string;
>     rwyCond?: string; zfw?: string; tow?: string; crzLvl?: string;
>     flap?: string; v2?: string; simPrep?: string };
>   dep: Apt; arr: Apt;
>   ops: { mel?: string; notam?: string; rte?: string; clearance?: string };
>   events: { phase: string; text: string; warn?: boolean }[] }
> interface Apt { ident: string; rwy?: string; atis?: string; del?: string;
>   gnd?: string; twr?: string; dep?: string; app?: string; elev?: string;
>   msa?: string; ta?: string; tl?: string }
> ```
>
> Then here is the sheet: <paste text, or attach the image/PDF>

## Loading it

1. `npm run dev:simref` (or the deployed build) and open the webview panel.
2. Paste the JSON, **Load & render**. It is saved to this device's local storage
   (`simref.content`) and rendered on the glasses. **Reset to sample** clears it.

Real evaluation content is airline-internal — it lives only on your device and
is never committed to this repository. Keep local working files under
`content/` (git-ignored).
