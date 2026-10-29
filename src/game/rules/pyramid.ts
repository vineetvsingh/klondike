import { clone, finish, makeDeck, pileOf, shuffle, top } from '../cards';
import type { Card, GameState, Hint, Loc, PileRef, Suit } from '../types';
import type { Rules } from './types';

/**
 * Pyramid: 28 cards in seven overlapping rows. Remove exposed cards in pairs that add
 * up to 13 (J = 11, Q = 12), kings on their own. The table is cleared when the pyramid
 * is gone. Each pyramid position is one tableau pile holding at most one card.
 */
export const ROWS = 7;
export const MAX_PASSES = 2; // three times through the stock

export const pidx = (r: number, c: number) => (r * (r + 1)) / 2 + c;
export function rowOf(i: number) {
  let r = 0;
  while (pidx(r + 1, 0) <= i) r++;
  return r;
}

/** Nothing in the row below still overlaps it. */
export function exposed(g: GameState, i: number) {
  if (!g.tableau[i]?.length) return false;
  const r = rowOf(i);
  if (r === ROWS - 1) return true;
  const c = i - pidx(r, 0);
  return !g.tableau[pidx(r + 1, c)].length && !g.tableau[pidx(r + 1, c + 1)].length;
}

function playable(g: GameState, loc: Loc) {
  if (loc.pile === 'tableau') return loc.i === 0 && exposed(g, loc.idx);
  return loc.pile === 'waste' && loc.i === g.waste.length - 1 && loc.i >= 0;
}

const cleared = (g: GameState) => g.tableau.every((p) => !p.length);

/** Every card that could be played right now: exposed pyramid cards, then the waste top. */
function free(g: GameState): Loc[] {
  const out: Loc[] = [];
  g.tableau.forEach((_, i) => { if (exposed(g, i)) out.push({ pile: 'tableau', idx: i, i: 0 }); });
  if (g.waste.length) out.push({ pile: 'waste', idx: 0, i: g.waste.length - 1 });
  return out;
}

const refOf = (l: Loc): PileRef => ({ pile: l.pile, idx: l.idx });

export const pyramid: Rules = {
  deal(_opts, random) {
    const deck = shuffle(makeDeck([0, 1, 2, 3] as Suit[]), random);
    const tableau: Card[][] = Array.from({ length: pidx(ROWS, 0) }, () => [{ ...deck.pop()!, up: true }]);
    return { stock: deck, waste: [], cells: [], foundations: [[]], tableau, score: 0 };
  },

  ids: () => makeDeck([0, 1, 2, 3]).map((c) => c.id),

  canPick: playable,

  canMove(g, from, to) {
    if (!playable(g, from)) return false;
    const c = pileOf(g, from)[from.i];
    if (to.pile === 'foundation') return c.rank === 13;
    if (c.rank === 13) return false;
    if (to.pile === 'tableau') {
      if (from.pile === 'tableau' && from.idx === to.idx) return false;
      return exposed(g, to.idx) && g.tableau[to.idx][0].rank + c.rank === 13;
    }
    if (to.pile === 'waste') {
      const t = top(g.waste);
      return from.pile === 'tableau' && !!t && t.rank + c.rank === 13;
    }
    return false;
  },

  move(g, from, to) {
    const n = clone(g);
    const gone = [pileOf(n, from).splice(from.i, 1)[0]];
    if (to.pile !== 'foundation') gone.unshift(pileOf(n, to).pop()!);
    n.foundations[0].push(...gone);
    finish(n, gone.length === 2 ? 10 : 5);
    n.won = cleared(n);
    if (n.won) n.score += 50 + 25 * (MAX_PASSES - n.passes); // bonus for finishing on an earlier pass
    return n;
  },

  draw(g) {
    const n = clone(g);
    if (n.stock.length) {
      n.waste.push({ ...n.stock.pop()!, up: true });
    } else if (n.waste.length && n.passes < MAX_PASSES) {
      n.stock = n.waste.reverse().map((c) => ({ ...c, up: false }));
      n.waste = [];
      n.passes += 1;
    } else {
      return null;
    }
    finish(n, 0);
    n.won = cleared(n);
    return n;
  },

  drawBlocked(g) {
    return !g.stock.length && g.waste.length && g.passes >= MAX_PASSES ? 'That was the last pass through the stock' : null;
  },

  autoTarget(g, from) {
    if (!playable(g, from)) return null;
    const c = pileOf(g, from)[from.i];
    if (c.rank === 13) return { pile: 'foundation', idx: 0 };
    for (const l of free(g)) {
      if (l.pile === from.pile && l.idx === from.idx) continue;
      const to = refOf(l);
      if (pyramid.canMove(g, from, to)) return to;
    }
    return null;
  },

  findHint(g): Hint | null {
    const cards = free(g);
    for (const from of cards) {
      if (pileOf(g, from)[from.i].rank === 13) return { kind: 'move', from, to: { pile: 'foundation', idx: 0 } };
    }
    for (const from of cards) {
      for (const other of cards) {
        if (other === from) continue;
        if (pyramid.canMove(g, from, refOf(other))) return { kind: 'move', from, to: refOf(other) };
      }
    }
    return g.stock.length || (g.waste.length && g.passes < MAX_PASSES) ? { kind: 'draw' } : null;
  },

  canAutoComplete: () => false,
  autoStep: () => null,
};
