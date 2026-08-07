/**
 * Sim-reference deck: a SimEval -> a small set of glance-cards, each within the
 * G2's 8-text-container budget and the fixed firmware font (ASCII only, no size
 * control). The dense A4 evaluation sheet becomes phase-appropriate glances:
 * SETUP · DEP · OPS · EVENTS · ARR.
 */
import { SCREEN_W } from '../bridge/bridge.js';
import type { HudContainer } from '../bridge/bridge.js';
import type { SimEval, Apt } from '../data/simcard.js';

const M = 14;
const W = SCREEN_W - 2 * M;
const H = 28;
const Y0 = 8;
const STEP = 34;

export interface Card {
  name: string;
  lines: string[];
}

/** Cards for one evaluation, in review order. */
export function deckFor(ev: SimEval): Card[] {
  const s = ev.setup;
  const setup: string[] = [
    `EVAL ${ev.no}  ${ev.title}`,
    `${s.dep} -> ${s.dest}   ${ev.pf} PF`,
    `WIND ${s.wind ?? '--'}  QNH ${s.qnh ?? '--'}  ${s.rwyCond ?? ''}`.trim(),
    `ZFW ${s.zfw ?? '--'}  TOW ${s.tow ?? '--'}  CRZ ${s.crzLvl ?? '--'}`,
    `FLAP ${s.flap ?? '--'}${s.v2 ? '  V2 ' + s.v2 : ''}  PREP ${s.simPrep ?? '--'}`,
  ];

  const ops: string[] = [];
  if (ev.ops.mel) ops.push(`MEL ${ev.ops.mel}`);
  if (ev.ops.notam) ops.push(`NOTAM ${ev.ops.notam}`);
  if (ev.ops.rte) ops.push(...wrap(`RTE ${ev.ops.rte}`, 2));
  if (ev.ops.clearance) ops.push(`CLR ${ev.ops.clearance}`);

  // Events: the injected failure/trap first, then the phase flow.
  const evLines = ev.events.map((e) => `${e.warn ? '>> ' : ''}${e.phase}: ${e.text}`);

  return [
    { name: 'SETUP', lines: setup },
    { name: 'DEP', lines: aptLines(ev.dep, 'DEP') },
    { name: 'OPS', lines: ops },
    { name: 'EVENTS', lines: evLines },
    { name: 'ARR', lines: aptLines(ev.arr, 'ARR') },
  ];
}

function aptLines(a: Apt, tag: string): string[] {
  const out = [`${tag} ${a.ident}${a.rwy ? ' ' + a.rwy : ''}`];
  if (a.atis) out.push(`ATIS ${a.atis}   ELEV ${a.elev ?? '--'}`);
  const line3 = [a.del && `DEL ${a.del}`, a.gnd && `GND ${a.gnd}`].filter(Boolean).join('  ');
  if (line3) out.push(line3);
  const line4 = [a.twr && `TWR ${a.twr}`, a.dep && `DEP ${a.dep}`, a.app && `APP ${a.app}`]
    .filter(Boolean)
    .join('  ');
  if (line4) out.push(line4);
  out.push(`MSA ${a.msa ?? '--'}  TA ${a.ta ?? '--'}  TL ${a.tl ?? '--'}`);
  return out;
}

/** Greedy word-wrap into at most `maxLines`, continuation lines indented. */
function wrap(text: string, maxLines: number, width = 46): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > width) {
      lines.push(lines.length ? '   ' + cur : cur);
      cur = w;
      if (lines.length >= maxLines) break;
    } else {
      cur = cur ? cur + ' ' + w : w;
    }
  }
  if (cur && lines.length < maxLines) lines.push(lines.length ? '   ' + cur : cur);
  return lines;
}

/** Render a card (plus a "NAME  i/n · EVAL k" footer) to positioned containers. */
export function renderCard(card: Card, index: number, total: number, evalNo: number): HudContainer[] {
  const lines = card.lines.slice(0, 6); // header + up to 6 leaves room for footer
  const containers: HudContainer[] = lines.map((text, i) => ({
    id: i + 1,
    x: M,
    y: Y0 + i * STEP,
    w: W,
    h: H,
    text,
  }));
  containers.push({
    id: 8,
    x: M,
    y: 260,
    w: W,
    h: H,
    text: `${card.name}   ${index + 1}/${total} - EVAL ${evalNo}`,
  });
  return containers;
}
