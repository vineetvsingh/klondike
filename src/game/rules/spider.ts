import { clone, finish, isRun, makeDeck, pileOf, reveal, sameSuit, shuffle, top } from '../cards';
import type { Card, GameState, Hint, Loc, PileRef, SpiderSuits, Suit } from '../types';
import type { Rules } from './types';

const SUIT_SETS: Record<SpiderSuits, Suit[]> = { 1: [0], 2: [0, 1], 4: [0, 1, 2, 3] };
const deckFor = (suits: SpiderSuits) => makeDeck(SUIT_SETS[suits], 8 / SUIT_SETS[suits].length);

const START_SCORE = 500;
const RUN_BONUS = 100;

const runFrom = (col: Card[], i: number) => isRun(col.slice(i), sameSuit);

/** Lifts any finished K→A same-suit run off the columns onto the next free foundation. */
function collectRuns(n: GameState): number {
  let found = 0;
  for (const col of n.tableau) {
    if (col.length < 13) continue;
    const run = col.slice(-13);
    if (run[0].rank === 13 && isRun(run, sameSuit)) {
      col.splice(-13);
      const slot = n.foundations.find((f) => !f.length);
      slot?.push(...run.reverse()); // the king ends up on top
      reveal(col);
      found++;
    }
  }
  return found;
}

export const spider: Rules = {
  deal(opts, random) {
    const deck = shuffle(deckFor(opts.suits), random);
    const tableau: Card[][] = Array.from({ length: 10 }, () => []);
    for (let i = 0; i < 54; i++) tableau[i % 10].push(deck.pop()!);
    return {
      stock: deck,
      waste: [],
      cells: [],
      foundations: Array.from({ length: 8 }, () => []),
      tableau: tableau.map((col) => col.map((c, i) => (i === col.length - 1 ? { ...c, up: true } : c))),
      score: START_SCORE,
    };
  },

  ids: (opts) => deckFor(opts.suits).map((c) => c.id),

  canPick(g, loc) {
    return loc.pile === 'tableau' && runFrom(g.tableau[loc.idx], loc.i);
  },

  canMove(g, from, to) {
    if (from.pile !== 'tableau' || to.pile !== 'tableau' || from.idx === to.idx) return false;
    const src = g.tableau[from.idx];
    if (!runFrom(src, from.i)) return false;
    const t = top(g.tableau[to.idx]);
    return t ? t.up && t.rank === src[from.i].rank + 1 : true;
  },

  move(g, from, to) {
    const n = clone(g);
    const src = pileOf(n, from);
    pileOf(n, to).push(...src.splice(from.i));
    reveal(src);
    return finish(n, -1 + collectRuns(n) * RUN_BONUS);
  },

  draw(g) {
    if (!g.stock.length || g.tableau.some((c) => !c.length)) return null;
    const n = clone(g);
    for (const col of n.tableau) col.push({ ...n.stock.pop()!, up: true });
    return finish(n, -1 + collectRuns(n) * RUN_BONUS);
  },

  drawBlocked(g) {
    return g.stock.length && g.tableau.some((c) => !c.length) ? 'Fill every column before dealing a new row' : null;
  },

  autoTarget(g, from) {
    if (from.pile !== 'tableau') return null;
    const card = g.tableau[from.idx][from.i];
    let best: { to: PileRef; score: number } | null = null;
    for (let t = 0; t < 10; t++) {
      const to: PileRef = { pile: 'tableau', idx: t };
      if (!spider.canMove(g, from, to)) continue;
      const dest = top(g.tableau[t]);
      if (!dest && from.i === 0) continue;
      const score = (dest ? (dest.suit === card.suit ? 0 : 10) : 30) + Math.abs(t - from.idx);
      if (!best || score < best.score) best = { to, score };
    }
    return best ? best.to : null;
  },

  findHint(g): Hint | null {
    type Option = { from: Loc; to: PileRef; score: number };
    let best: Option | null = null;
    g.tableau.forEach((col, t) => {
      const i = col.findIndex((_, k) => runFrom(col, k));
      if (i < 0) return;
      const from: Loc = { pile: 'tableau', idx: t, i };
      const below = col[i - 1];
      const reveals = below ? !below.up : false;
      const breaksRun = below?.up && below.rank === col[i].rank + 1; // already sitting somewhere legal
      for (let t2 = 0; t2 < 10; t2++) {
        const to: PileRef = { pile: 'tableau', idx: t2 };
        if (!spider.canMove(g, from, to)) continue;
        const dest = top(g.tableau[t2]);
        let score: number;
        if (dest && dest.suit === col[i].suit) score = 0;
        else if (reveals && dest) score = 1;
        else if (reveals) score = 3;
        else if (dest && !breaksRun && i === 0) score = 2; // empties a column
        else continue;
        if (!best || score < best.score) best = { from, to, score };
      }
    });
    if (best) return { kind: 'move', from: (best as Option).from, to: (best as Option).to };
    if (g.stock.length && !g.tableau.some((c) => !c.length)) return { kind: 'draw' };
    return null;
  },

  canAutoComplete: () => false,
  autoStep: () => null,
};
