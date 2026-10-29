import { alternating, clone, finish, makeDeck, pileOf, reveal, shuffle, toFoundation, top } from '../cards';
import type { Card, GameState, Hint, Loc, PileRef, Suit } from '../types';
import type { Rules } from './types';

const RECYCLE_PENALTY = 20;

export const klondike: Rules = {
  deal(_opts, random) {
    const deck = shuffle(makeDeck([0, 1, 2, 3] as Suit[]), random);
    const tableau: Card[][] = [[], [], [], [], [], [], []];
    for (let row = 0; row < 7; row++) {
      for (let col = row; col < 7; col++) tableau[col].push(deck.pop()!);
    }
    return {
      stock: deck,
      waste: [],
      cells: [],
      foundations: [[], [], [], []],
      tableau: tableau.map((col) => col.map((c, i) => (i === col.length - 1 ? { ...c, up: true } : c))),
      score: 0,
    };
  },

  ids: () => makeDeck([0, 1, 2, 3]).map((c) => c.id),

  canPick(g, loc) {
    const arr = pileOf(g, loc);
    const c = arr[loc.i];
    if (!c?.up || loc.pile === 'stock') return false;
    return loc.pile === 'tableau' || loc.i === arr.length - 1;
  },

  canMove(g, from, to) {
    if (from.pile === 'stock') return false;
    const src = pileOf(g, from);
    const c = src[from.i];
    if (!c || !c.up) return false;
    if (from.pile === to.pile && from.idx === to.idx) return false;
    const count = src.length - from.i;
    const t = top(pileOf(g, to));

    if (to.pile === 'foundation') {
      if (count !== 1 || from.pile === 'foundation') return false;
      return toFoundation(pileOf(g, to), c);
    }
    if (to.pile === 'tableau') {
      if (from.pile !== 'tableau' && count !== 1) return false;
      return t ? t.up && alternating(c, t) : c.rank === 13;
    }
    return false;
  },

  move(g, from, to) {
    const n = clone(g);
    const src = pileOf(n, from);
    pileOf(n, to).push(...src.splice(from.i));

    let delta = 0;
    if (to.pile === 'foundation') delta += 10;
    else if (from.pile === 'waste') delta += 5;
    else if (from.pile === 'foundation') delta -= 15;
    if (from.pile === 'tableau' && reveal(src)) delta += 5;
    return finish(n, delta);
  },

  draw(g) {
    const n = clone(g);
    if (!n.stock.length) {
      if (!n.waste.length) return null;
      n.stock = n.waste.reverse().map((c) => ({ ...c, up: false }));
      n.waste = [];
      return finish(n, -RECYCLE_PENALTY);
    }
    for (let k = Math.min(g.draw, n.stock.length); k > 0; k--) {
      const c = n.stock.pop()!;
      n.waste.push({ ...c, up: true });
    }
    return finish(n, 0);
  },

  drawBlocked: () => null,

  autoTarget(g, from) {
    if (from.i === pileOf(g, from).length - 1) {
      for (let f = 0; f < 4; f++) {
        const to: PileRef = { pile: 'foundation', idx: f };
        if (klondike.canMove(g, from, to)) return to;
      }
    }
    let best: { to: PileRef; score: number } | null = null;
    for (let t = 0; t < 7; t++) {
      const to: PileRef = { pile: 'tableau', idx: t };
      if (!klondike.canMove(g, from, to)) continue;
      const empty = g.tableau[t].length === 0;
      if (empty && from.pile === 'tableau' && from.i === 0) continue; // king already heads its column
      const score = (empty ? 10 : 0) + (from.pile === 'tableau' ? Math.abs(t - from.idx) : t);
      if (!best || score < best.score) best = { to, score };
    }
    return best ? best.to : null;
  },

  findHint(g): Hint | null {
    const tops: Loc[] = [];
    if (g.waste.length) tops.push({ pile: 'waste', idx: 0, i: g.waste.length - 1 });
    g.tableau.forEach((col, t) => {
      if (col.length) tops.push({ pile: 'tableau', idx: t, i: col.length - 1 });
    });

    for (const from of tops) {
      for (let f = 0; f < 4; f++) {
        const to: PileRef = { pile: 'foundation', idx: f };
        if (klondike.canMove(g, from, to)) return { kind: 'move', from, to };
      }
    }

    // Tableau moves that turn over a hidden card or open up a column.
    for (let t = 0; t < 7; t++) {
      const i = g.tableau[t].findIndex((c) => c.up);
      if (i < 0) continue;
      const from: Loc = { pile: 'tableau', idx: t, i };
      for (let t2 = 0; t2 < 7; t2++) {
        if (i === 0 && !g.tableau[t2].length) continue;
        const to: PileRef = { pile: 'tableau', idx: t2 };
        if (klondike.canMove(g, from, to)) return { kind: 'move', from, to };
      }
    }

    if (g.waste.length) {
      const from = tops[0];
      for (let t = 0; t < 7; t++) {
        const to: PileRef = { pile: 'tableau', idx: t };
        if (klondike.canMove(g, from, to)) return { kind: 'move', from, to };
      }
    }

    return g.stock.length || g.waste.length ? { kind: 'draw' } : null;
  },

  /** Everything is face-up and the stock is spent: the rest is a formality. */
  canAutoComplete(g) {
    return !g.won && !g.stock.length && !g.waste.length && g.tableau.every((col) => col.every((c) => c.up));
  },

  autoStep: (g) => lowestToFoundation(g, klondike),
};

/** Shared finisher: send the lowest playable card home (columns are ordered, so this always completes). */
export function lowestToFoundation(g: GameState, rules: Rules) {
  let best: { from: Loc; to: PileRef; rank: number } | null = null;
  const sources: Loc[] = [];
  g.tableau.forEach((col, t) => { if (col.length) sources.push({ pile: 'tableau', idx: t, i: col.length - 1 }); });
  g.cells.forEach((cell, c) => { if (cell.length) sources.push({ pile: 'cell', idx: c, i: 0 }); });
  for (const from of sources) {
    const card = pileOf(g, from)[from.i];
    for (let f = 0; f < g.foundations.length; f++) {
      const to: PileRef = { pile: 'foundation', idx: f };
      if (rules.canMove(g, from, to) && (!best || card.rank < best.rank)) best = { from, to, rank: card.rank };
    }
  }
  return best;
}
