import { describe, expect, it } from 'vitest';
import {
  autoStep, autoTarget, canAutoComplete, canMove, draw, findHint, move, newDeal, normalizeState,
} from './engine';
import type { Card, GameState, Suit } from './types';

const card = (suit: Suit, rank: number, up = true): Card => ({ id: `${'SHDC'[suit]}${rank}`, suit, rank, up });

function empty(): GameState {
  return {
    variant: 'klondike',
    stock: [], waste: [], cells: [], foundations: [[], [], [], []], tableau: [[], [], [], [], [], [], []],
    score: 0, moves: 0, draw: 1, suits: 4, passes: 0, started: false, won: false, dealId: 1,
    seed: null, daily: null, verified: false, usedUndo: false, usedHint: false,
  };
}

const klondike = (seed: number) => newDeal({ variant: 'klondike', draw: 1, suits: 4, dealId: 1, seed });

describe('newDeal', () => {
  it('deals 28 tableau cards with only the tops face-up', () => {
    const g = klondike(1);
    expect(g.tableau.map((c) => c.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(g.stock).toHaveLength(24);
    g.tableau.forEach((col) => col.forEach((c, i) => expect(c.up).toBe(i === col.length - 1)));
    expect(normalizeState(g)).not.toBeNull();
  });

  it('is reproducible from its seed', () => {
    expect(klondike(42)).toEqual(klondike(42));
    expect(klondike(42).stock).not.toEqual(klondike(43).stock);
  });

  it('upgrades saves from before variants existed', () => {
    const { variant, cells, suits, seed, daily, verified, usedUndo, usedHint, ...old } = klondike(7);
    void [variant, cells, suits, seed, daily, verified, usedUndo, usedHint];
    const g = normalizeState(old);
    expect(g?.variant).toBe('klondike');
    expect(g?.cells).toEqual([]);
    expect(normalizeState({ ...old, tableau: [] })).toBeNull();
  });
});

describe('rules', () => {
  it('builds tableau down in alternating colours and only kings on empty columns', () => {
    const g = empty();
    g.tableau[0] = [card(0, 8)]; // 8♠
    g.waste = [card(1, 7)]; // 7♥
    const from = { pile: 'waste' as const, idx: 0, i: 0 };
    expect(canMove(g, from, { pile: 'tableau', idx: 0 })).toBe(true);
    expect(canMove(g, from, { pile: 'tableau', idx: 1 })).toBe(false);
    g.waste = [card(3, 7)]; // 7♣ on 8♠: same colour
    expect(canMove(g, from, { pile: 'tableau', idx: 0 })).toBe(false);
    g.waste = [card(3, 13)];
    expect(canMove(g, from, { pile: 'tableau', idx: 1 })).toBe(true);
  });

  it('reveals the card underneath and scores it', () => {
    const g = empty();
    g.tableau[0] = [card(2, 4, false), card(1, 1)];
    const n = move(g, { pile: 'tableau', idx: 0, i: 1 }, { pile: 'foundation', idx: 0 });
    expect(n.tableau[0][0].up).toBe(true);
    expect(n.score).toBe(15);
    expect(g.tableau[0][0].up).toBe(false); // original untouched
  });

  it('draws three and recycles with a penalty', () => {
    const g = { ...empty(), draw: 3 as const, score: 50, stock: [card(0, 2, false), card(0, 3, false), card(0, 4, false), card(0, 5, false)] };
    const a = draw(g)!;
    expect(a.waste.map((c) => c.rank)).toEqual([5, 4, 3]);
    const b = draw(a)!;
    expect(b.stock).toHaveLength(0);
    const c = draw(b)!;
    expect(c.stock).toHaveLength(4);
    expect(c.stock.every((x) => !x.up)).toBe(true);
    expect(c.score).toBe(30);
  });

  it('tap sends an ace home first', () => {
    const g = empty();
    g.tableau[2] = [card(1, 1)];
    expect(autoTarget(g, { pile: 'tableau', idx: 2, i: 0 })).toEqual({ pile: 'foundation', idx: 0 });
  });

  it('hint suggests a move when one exists', () => {
    const g = empty();
    g.tableau[0] = [card(0, 1)];
    expect(findHint(g)).toMatchObject({ kind: 'move', to: { pile: 'foundation' } });
  });
});

describe('auto-complete', () => {
  it('finishes a fully revealed table and flags the win', () => {
    let g = empty();
    for (let s = 0; s < 4; s++) {
      g.foundations[s] = Array.from({ length: 10 }, (_, i) => card(s as Suit, i + 1));
    }
    g.tableau = [
      [card(0, 13), card(1, 12), card(0, 11)],
      [card(1, 13), card(0, 12), card(1, 11)],
      [card(2, 13), card(3, 12), card(2, 11)],
      [card(3, 13), card(2, 12), card(3, 11)],
      [], [], [],
    ];
    expect(canAutoComplete(g)).toBe(true);
    let steps = 0;
    for (let step = autoStep(g); step; step = autoStep(g)) {
      g = move(g, step.from, step.to);
      steps++;
    }
    expect(steps).toBe(12);
    expect(g.won).toBe(true);
  });
});
