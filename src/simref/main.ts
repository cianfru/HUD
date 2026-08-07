/**
 * Sim-reference build — a swipeable deck of glance-cards distilled from an
 * airline sim-evaluation sheet, rendered on the G2 via the Even Hub SDK.
 *
 * This is the non-flight, ungated use of the glasses: your sim prep, heads-up.
 * Touchpad / R1 ring:
 *   swipe down / up  -> next / previous card
 *   double-press     -> jump to the next evaluation
 *   press            -> jump to this evaluation's EVENTS card
 */
import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
import { EvenSdkBridge } from '../bridge/even-sdk.js';
import { A350_CYCLE3 } from '../data/simcard.js';
import { deckFor, renderCard } from './cards.js';
import type { Card } from './cards.js';

function status(msg: string): void {
  const el = document.getElementById('status');
  if (el) el.textContent = msg;
  console.log('[simref]', msg);
}

interface FlatCard {
  card: Card;
  evalNo: number;
  idxInEval: number;
  countInEval: number;
  evalStart: number;
}

async function boot(): Promise<void> {
  status('waiting for Even bridge…');
  const sdk = await waitForEvenAppBridge();
  const bridge = new EvenSdkBridge(sdk);

  // Flatten every evaluation's deck into one navigable list.
  const flat: FlatCard[] = [];
  for (const ev of A350_CYCLE3) {
    const deck = deckFor(ev);
    const evalStart = flat.length;
    deck.forEach((card, i) =>
      flat.push({ card, evalNo: ev.no, idxInEval: i, countInEval: deck.length, evalStart }),
    );
  }

  let pos = 0;
  let started = false;
  const draw = (): void => {
    const f = flat[pos]!;
    const containers = renderCard(f.card, f.idxInEval, f.countInEval, f.evalNo);
    if (!started) {
      started = true;
      void bridge.createPage(containers);
    } else {
      void bridge.rebuildPage(containers);
    }
  };

  const go = (d: number): void => {
    pos = (pos + d + flat.length) % flat.length;
    draw();
  };
  const nextEval = (): void => {
    const start = flat[pos]!.evalStart;
    const count = flat[pos]!.countInEval;
    pos = (start + count) % flat.length;
    draw();
  };
  const toEvents = (): void => {
    const f = flat[pos]!;
    const events = f.evalStart + Math.min(3, f.countInEval - 1); // EVENTS is card index 3
    pos = events;
    draw();
  };

  bridge.onGesture((g) => {
    if (g.type === 'swipeDown') go(1);
    else if (g.type === 'swipeUp') go(-1);
    else if (g.type === 'doublePress') nextEval();
    else if (g.type === 'press') toEvents();
  });

  draw();
  status(`sim reference loaded — ${A350_CYCLE3.length} evals, ${flat.length} cards`);
}

boot().catch((err) => status(`failed to start: ${String(err)}`));
