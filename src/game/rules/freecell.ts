import { alternating, clone, finish, isRun, makeDeck, pileOf, shuffle, toFoundation, top } from '../cards';
import type { Card, GameState, Hint, Loc, PileRef, Suit } from '../types';
import { lowestToFoundation } from './klondike';
import type { Rules } from './types';

/** How many cards can travel at once, by shuffling through free cells and empty columns. */
export function capacity(g: GameState, toEmptyColumn: boolean) {
  const freeCells = g.cells.filter((c) => !c.length).length;
  const emptyCols = g.tableau.filter((c) => !c.length).length - (toEmptyColumn ? 1 : 0);
  return (freeCells + 1) * 2 ** Math.max(0, emptyCols);
}

const runFrom = (col: Card[], i: number) => isRun(col.slice(i), alternating);

export const freecell: Rules = {
  deal(_opts, random) {
    const deck = shuffle(makeDeck([0, 1, 2, 3] as Suit[]), random);
    const tableau: Card[][] = Array.from({ length: 8 }, () => []);
    deck.forEach((c, i) => tableau[i % 8].push({ ...c, up: true }));
    return { stock: [], waste: [], cells: [[], [], [], []], foundations: [[], [], [], []], tableau, score: 0 };
  },

  ids: () => makeDeck([0, 1, 2, 3]).map((c) => c.id),

  canPick(g, loc) {
    if (loc.pile === 'cell') return !!g.cells[loc.idx][0];
    if (loc.pile !== 'tableau') return false;
    const col = g.tableau[loc.idx];
    return runFrom(col, loc.i) && col.length - loc.i <= capacity(g, false);
  },

  canMove(g, from, to) {
    if (from.pile === 'foundation' || from.pile === 'stock' || from.pile === 'waste') return false;
    if (from.pile === to.pile && from.idx === to.idx) return false;
    const src = pileOf(g, from);
    const cards = src.slice(from.i);
    const c = cards[0];
    if (!c) return false;
    if (from.pile === 'tableau' && !runFrom(src, from.i)) return false;
    const dest = pileOf(g, to);

    if (to.pile === 'cell') return cards.length === 1 && dest.length === 0;
    if (to.pile === 'foundation') return cards.length === 1 && toFoundation(dest, c);
    if (to.pile === 'tableau') {
      const t = top(dest);
      if (t && !alternating(c, t)) return false;
      return cards.length <= capacity(g, !t);
    }
    return false;
  },

  move(g, from, to) {
    const n = clone(g);
    pileOf(n, to).push(...pileOf(n, from).splice(from.i));
    return finish(n, to.pile === 'foundation' ? 10 : 0);
  },

  draw: () => null,
  drawBlocked: () => null,

  autoTarget(g, from) {
    const single = from.i === pileOf(g, from).length - 1;
    if (single) {
      for (let f = 0; f < 4; f++) {
        const to: PileRef = { pile: 'foundation', idx: f };
        if (freecell.canMove(g, from, to)) return to;
      }
    }
    let best: { to: PileRef; score: number } | null = null;
    for (let t = 0; t < 8; t++) {
      const to: PileRef = { pile: 'tableau', idx: t };
      if (!freecell.canMove(g, from, to)) continue;
      const empty = !g.tableau[t].length;
      if (empty && from.pile === 'tableau' && from.i === 0) continue;
      const score = (empty ? 20 : 0) + (from.pile === 'tableau' ? Math.abs(t - from.idx) : t);
      if (!best || score < best.score) best = { to, score };
    }
    if (best) return best.to;
    if (single && from.pile === 'tableau') {
      const free = g.cells.findIndex((c) => !c.length);
      if (free >= 0) return { pile: 'cell', idx: free };
    }
    return null;
  },

  findHint(g): Hint | null {
    const tops: Loc[] = [];
    g.cells.forEach((cell, c) => { if (cell.length) tops.push({ pile: 'cell', idx: c, i: 0 }); });
    g.tableau.forEach((col, t) => { if (col.length) tops.push({ pile: 'tableau', idx: t, i: col.length - 1 }); });

    for (const from of tops) {
      for (let f = 0; f < 4; f++) {
        const to: PileRef = { pile: 'foundation', idx: f };
        if (freecell.canMove(g, from, to)) return { kind: 'move', from, to };
      }
    }

    // Build onto existing columns, longest movable run first.
    for (let t = 0; t < 8; t++) {
      const col = g.tableau[t];
      for (let i = 0; i < col.length; i++) {
        if (!runFrom(col, i)) continue;
        const from: Loc = { pile: 'tableau', idx: t, i };
        for (let t2 = 0; t2 < 8; t2++) {
          if (!g.tableau[t2].length) continue;
          const to: PileRef = { pile: 'tableau', idx: t2 };
          if (freecell.canMove(g, from, to)) return { kind: 'move', from, to };
        }
      }
    }

    for (const from of tops.filter((l) => l.pile === 'cell')) {
      for (let t = 0; t < 8; t++) {
        const to: PileRef = { pile: 'tableau', idx: t };
        if (freecell.canMove(g, from, to)) return { kind: 'move', from, to };
      }
    }

    const emptyCol = g.tableau.findIndex((c) => !c.length);
    if (emptyCol >= 0) {
      for (let t = 0; t < 8; t++) {
        const col = g.tableau[t];
        const i = col.findIndex((_, k) => runFrom(col, k));
        if (i > 0) {
          const from: Loc = { pile: 'tableau', idx: t, i };
          if (freecell.canMove(g, from, { pile: 'tableau', idx: emptyCol })) {
            return { kind: 'move', from, to: { pile: 'tableau', idx: emptyCol } };
          }
        }
      }
    }

    const free = g.cells.findIndex((c) => !c.length);
    if (free >= 0) {
      const from = tops.find((l) => l.pile === 'tableau' && g.tableau[l.idx].length > 1);
      if (from) return { kind: 'move', from, to: { pile: 'cell', idx: free } };
    }
    return null;
  },

  /** Every column is in descending order, so the lowest card is always reachable. */
  canAutoComplete(g) {
    return !g.won && g.tableau.every((col) => col.every((c, i) => i === 0 || c.rank < col[i - 1].rank));
  },

  autoStep: (g) => lowestToFoundation(g, freecell),
};
