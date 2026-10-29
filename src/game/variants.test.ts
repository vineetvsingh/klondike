import { describe, expect, it } from 'vitest';
import { canMove, canPick, draw, drawBlocked, findHint, move, newDeal, normalizeState } from './engine';
import { capacity } from './rules/freecell';
import type { Card, GameState, Suit } from './types';

const card = (suit: Suit, rank: number, up = true, copy = 0): Card =>
  ({ id: `${'SHDC'[suit]}${rank}${copy ? `.${copy}` : ''}`, suit, rank, up });

describe('FreeCell', () => {
  const deal = () => newDeal({ variant: 'freecell', draw: 1, suits: 4, dealId: 1, seed: 5 });

  it('deals all 52 cards face-up into 8 columns', () => {
    const g = deal();
    expect(g.tableau.map((c) => c.length)).toEqual([7, 7, 7, 7, 6, 6, 6, 6]);
    expect(g.tableau.flat().every((c) => c.up)).toBe(true);
    expect(g.cells).toEqual([[], [], [], []]);
    expect(normalizeState(g)).not.toBeNull();
  });

  it('lets any single card into a free cell, and only one per cell', () => {
    const g = deal();
    const from = { pile: 'tableau' as const, idx: 0, i: 6 };
    expect(canMove(g, from, { pile: 'cell', idx: 0 })).toBe(true);
    const n = move(g, from, { pile: 'cell', idx: 0 });
    expect(n.cells[0]).toHaveLength(1);
    expect(canMove(n, { pile: 'tableau', idx: 1, i: 6 }, { pile: 'cell', idx: 0 })).toBe(false);
  });

  it('limits run moves by free cells and empty columns', () => {
    const g = deal();
    g.tableau = [[card(0, 9), card(1, 8), card(0, 7), card(1, 6)], [card(1, 10)], [], [], [], [], [], []];
    g.cells = [[card(3, 1)], [card(3, 2)], [card(3, 3)], []];
    // 1 free cell, 6 empty columns: (1 + 1) * 2^6 — plenty either way
    expect(capacity(g, false)).toBe(128);
    expect(canMove(g, { pile: 'tableau', idx: 0, i: 0 }, { pile: 'tableau', idx: 1 })).toBe(true);
    g.tableau = [g.tableau[0], g.tableau[1], ...Array.from({ length: 6 }, (_, i) => [card(2, 13 - i)])];
    g.cells = [[card(3, 1)], [card(3, 2)], [card(3, 3)], [card(3, 4)]];
    expect(capacity(g, false)).toBe(1);
    expect(canPick(g, { pile: 'tableau', idx: 0, i: 0 })).toBe(false);
    expect(canMove(g, { pile: 'tableau', idx: 0, i: 3 }, { pile: 'tableau', idx: 1 })).toBe(false); // 6♥ on 10♥
  });

  it('suggests a hint on a fresh deal', () => {
    expect(findHint(deal())).not.toBeNull();
  });
});

describe('Spider', () => {
  const deal = (suits: 1 | 2 | 4 = 1) => newDeal({ variant: 'spider', draw: 1, suits, dealId: 1, seed: 9 });

  it('deals 104 cards: 54 to the table, 50 in the stock', () => {
    for (const suits of [1, 2, 4] as const) {
      const g = deal(suits);
      expect(g.tableau.map((c) => c.length)).toEqual([6, 6, 6, 6, 5, 5, 5, 5, 5, 5]);
      expect(g.stock).toHaveLength(50);
      expect(new Set([...g.stock, ...g.tableau.flat()].map((c) => c.id)).size).toBe(104);
      expect(g.foundations).toHaveLength(8);
      expect(normalizeState(g)).not.toBeNull();
    }
  });

  it('moves only same-suit runs, onto any card one higher', () => {
    const g = deal();
    g.tableau = [
      [card(0, 9), card(0, 8, true, 1), card(0, 7)],
      [card(1, 9)],
      [card(1, 8)],
      ...Array.from({ length: 7 }, () => [card(3, 2)]),
    ];
    expect(canMove(g, { pile: 'tableau', idx: 0, i: 1 }, { pile: 'tableau', idx: 1 })).toBe(true); // 8-7♠ on 9♥
    g.tableau[0] = [card(0, 9), card(1, 8, true, 1), card(0, 7)];
    expect(canPick(g, { pile: 'tableau', idx: 0, i: 1 })).toBe(false); // mixed suits don't travel together
    expect(canPick(g, { pile: 'tableau', idx: 0, i: 2 })).toBe(true);
  });

  it('deals a row only when every column has a card', () => {
    const g = deal();
    const n = draw(g)!;
    expect(n.tableau.every((col) => col[col.length - 1].up)).toBe(true);
    expect(n.stock).toHaveLength(40);
    g.tableau[3] = [];
    expect(draw(g)).toBeNull();
    expect(drawBlocked(g)).toMatch(/every column/);
  });

  it('clears a finished King-to-Ace run to the foundations and scores it', () => {
    const g: GameState = { ...deal(), stock: [] };
    const run = Array.from({ length: 12 }, (_, i) => card(0, 13 - i));
    g.tableau = [[card(1, 5, false), ...run], [card(0, 1)], ...Array.from({ length: 8 }, () => [])];
    g.score = 500;
    const n = move(g, { pile: 'tableau', idx: 1, i: 0 }, { pile: 'tableau', idx: 0 });
    expect(n.tableau[0]).toHaveLength(1);
    expect(n.tableau[0][0].up).toBe(true);
    expect(n.foundations[0]).toHaveLength(13);
    expect(n.foundations[0][12].rank).toBe(13);
    expect(n.score).toBe(500 - 1 + 100);
  });
});

describe('Pyramid', () => {
  const deal = () => newDeal({ variant: 'pyramid', draw: 1, suits: 4, dealId: 1, seed: 3 });
  const blank = (): GameState => {
    const g = deal();
    g.tableau = g.tableau.map(() => []);
    return g;
  };

  it('deals a 28-card pyramid with 24 in the stock', () => {
    const g = deal();
    expect(g.tableau).toHaveLength(28);
    expect(g.tableau.every((p) => p.length === 1 && p[0].up)).toBe(true);
    expect(g.stock).toHaveLength(24);
    expect(normalizeState(g)).not.toBeNull();
  });

  it('only exposed cards play, in pairs adding up to 13', () => {
    const g = blank();
    g.tableau[27] = [card(0, 6)];
    g.tableau[26] = [card(1, 7)];
    g.tableau[20] = [card(2, 7)]; // covered by 26 and 27
    expect(canPick(g, { pile: 'tableau', idx: 20, i: 0 })).toBe(false);
    expect(canMove(g, { pile: 'tableau', idx: 27, i: 0 }, { pile: 'tableau', idx: 26 })).toBe(true);
    const n = move(g, { pile: 'tableau', idx: 27, i: 0 }, { pile: 'tableau', idx: 26 });
    expect(n.foundations[0]).toHaveLength(2);
    expect(canPick(n, { pile: 'tableau', idx: 20, i: 0 })).toBe(true);
  });

  it('removes kings alone and wins when the pyramid is clear', () => {
    const g = blank();
    g.tableau[0] = [card(3, 13)];
    const n = move(g, { pile: 'tableau', idx: 0, i: 0 }, { pile: 'foundation', idx: 0 });
    expect(n.won).toBe(true);
  });

  it('pairs with the waste and allows three passes through the stock', () => {
    let g = blank();
    g.tableau[27] = [card(0, 1)];
    g.stock = [card(1, 5, false), card(1, 12, false)];
    g = draw(g)!; // Q on the waste
    expect(canMove(g, { pile: 'waste', idx: 0, i: 0 }, { pile: 'tableau', idx: 27 })).toBe(true);
    g = draw(draw(g)!)!; // through the stock, then turn it over
    expect(g.passes).toBe(1);
    g = draw(draw(draw(g)!)!)!;
    expect(g.passes).toBe(2);
    g = draw(draw(g)!)!;
    expect(draw(g)).toBeNull();
    expect(drawBlocked(g)).toMatch(/last pass/);
  });
});
