import type { DrawMode, GameState } from './types';

/**
 * A depth-first Klondike solver, used to hand out deals that are proven winnable.
 *
 * Stock and waste are treated as one "talon" with a pointer `p` (cards in the waste).
 * Instead of searching over individual draws, every talon card reachable by drawing
 * (and recycling) becomes a direct move, which keeps the search tree small. A visited
 * set, safe automatic foundation moves and move pruning do the rest. The search has a
 * node budget; running out means "unknown", never a false "winnable".
 */

// Cards are ints 0..51: suit * 13 + (rank - 1).
const suitOf = (c: number) => (c / 13) | 0;
const rankOf = (c: number) => (c % 13) + 1;
const redSuit = (s: number) => s === 1 || s === 2;

interface S {
  cols: number[][];
  down: number[]; // face-down cards at the bottom of each column
  found: number[]; // top rank on each suit's foundation
  talon: number[]; // waste (bottom → top) followed by stock in draw order
  p: number; // cards currently in the waste
}

export type SolverMove =
  | { k: 'tf'; col: number }
  | { k: 'tt'; from: number; i: number; to: number }
  | { k: 'wf'; q: number }
  | { k: 'wt'; q: number; to: number };

export interface SolveResult {
  result: 'win' | 'lose' | 'unknown';
  nodes: number;
  path: SolverMove[];
}

export interface SolveOptions {
  budget?: number;
  /** Stop once the rest is a formality (everything face-up). Off to get a complete move list. */
  shortcut?: boolean;
}

const toInt = (c: { suit: number; rank: number }) => c.suit * 13 + c.rank - 1;

export function fromGame(g: GameState): S {
  const found = [0, 0, 0, 0];
  for (const pile of g.foundations) {
    const t = pile[pile.length - 1];
    if (t) found[t.suit] = t.rank;
  }
  return {
    cols: g.tableau.map((col) => col.map(toInt)),
    down: g.tableau.map((col) => col.filter((c) => !c.up).length),
    found,
    talon: [...g.waste.map(toInt), ...[...g.stock].reverse().map(toInt)],
    p: g.waste.length,
  };
}

/** Waste positions (1-based count of waste cards) that drawing can bring to the top. */
export function reachable(len: number, p: number, draw: DrawMode): number[] {
  if (draw === 1) return Array.from({ length: len }, (_, i) => i + 1);
  const out = new Set<number>();
  if (p > 0) out.add(p);
  for (let q = p + draw; q < len + draw; q += draw) out.add(Math.min(q, len));
  for (let q = draw; q < len + draw; q += draw) out.add(Math.min(q, len));
  return [...out].filter((q) => q >= 1 && q <= len);
}

const fitsOn = (c: number, t: number) =>
  rankOf(t) === rankOf(c) + 1 && redSuit(suitOf(t)) !== redSuit(suitOf(c));

const toFound = (s: S, c: number) => s.found[suitOf(c)] === rankOf(c) - 1;

/** Safe to send home: nothing that could still need it as a landing spot is left behind. */
function safe(s: S, c: number) {
  const r = rankOf(c);
  if (!toFound(s, c)) return false;
  if (r <= 2) return true;
  const red = redSuit(suitOf(c));
  return s.found.every((f, suit) => redSuit(suit) === red || f >= r - 1);
}

function copy(s: S): S {
  return { cols: s.cols.slice(), down: s.down.slice(), found: s.found.slice(), talon: s.talon, p: s.p };
}

function afterRemove(n: S, col: number) {
  if (n.down[col] > 0 && n.cols[col].length === n.down[col]) n.down[col]--;
}

function apply(s: S, m: SolverMove): S {
  const n = copy(s);
  switch (m.k) {
    case 'tf': {
      const col = n.cols[m.col].slice();
      const c = col.pop()!;
      n.cols[m.col] = col;
      n.found[suitOf(c)]++;
      afterRemove(n, m.col);
      break;
    }
    case 'tt': {
      const src = n.cols[m.from];
      n.cols[m.to] = n.cols[m.to].concat(src.slice(m.i));
      n.cols[m.from] = src.slice(0, m.i);
      afterRemove(n, m.from);
      break;
    }
    case 'wf':
    case 'wt': {
      const c = n.talon[m.q - 1];
      n.talon = n.talon.slice(0, m.q - 1).concat(n.talon.slice(m.q));
      n.p = m.q - 1;
      if (m.k === 'wf') n.found[suitOf(c)]++;
      else n.cols[m.to] = n.cols[m.to].concat(c);
      break;
    }
  }
  return n;
}

function key(s: S) {
  const cols = s.cols.map((col, i) => `${s.down[i]}${String.fromCharCode(...col.map((c) => c + 48))}`).sort();
  return `${s.found.join('')}|${s.p}|${String.fromCharCode(...s.talon.map((c) => c + 48))}|${cols.join(',')}`;
}

function moves(s: S, draw: DrawMode): SolverMove[] {
  const out: { m: SolverMove; score: number }[] = [];
  const cols = s.cols;
  const firstEmpty = cols.findIndex((c) => !c.length);

  cols.forEach((col, f) => {
    if (!col.length) return;
    const top = col[col.length - 1];
    if (toFound(s, top)) out.push({ m: { k: 'tf', col: f }, score: 80 + (col.length - 1 === s.down[f] && s.down[f] ? 30 : 0) });

    for (let i = s.down[f]; i < col.length; i++) {
      const c = col[i];
      const whole = i === s.down[f];
      // A partial move only helps if it frees the card underneath for its foundation.
      if (!whole && !toFound(s, col[i - 1])) continue;
      if (whole && i === 0 && rankOf(c) === 13) continue; // a king already heading its column
      for (let t = 0; t < cols.length; t++) {
        if (t === f) continue;
        const dest = cols[t];
        if (dest.length) {
          if (!fitsOn(c, dest[dest.length - 1])) continue;
        } else if (rankOf(c) !== 13 || t !== firstEmpty) continue;
        let score = whole ? (s.down[f] ? 100 + s.down[f] : 30) : 20;
        if (!dest.length) score -= 5;
        out.push({ m: { k: 'tt', from: f, i, to: t }, score });
      }
    }
  });

  for (const q of reachable(s.talon.length, s.p, draw)) {
    const c = s.talon[q - 1];
    if (toFound(s, c)) out.push({ m: { k: 'wf', q }, score: 70 });
    for (let t = 0; t < cols.length; t++) {
      const dest = cols[t];
      if (dest.length ? fitsOn(c, dest[dest.length - 1]) : rankOf(c) === 13 && t === firstEmpty) {
        out.push({ m: { k: 'wt', q, to: t }, score: 40 + (q === s.p ? 2 : 0) });
      }
    }
  }

  return out.sort((a, b) => b.score - a.score).map((o) => o.m);
}

class OutOfBudget extends Error {}

export function solveKlondike(g: GameState, opts: SolveOptions = {}): SolveResult {
  const budget = opts.budget ?? 60000;
  const shortcut = opts.shortcut ?? true;
  const draw = g.draw;
  const visited = new Set<string>();
  const path: SolverMove[] = [];
  let nodes = 0;

  const won = (s: S) =>
    s.found.every((f) => f === 13) ||
    (shortcut && s.down.every((d) => d === 0) && (draw === 1 || !s.talon.length));

  const dfs = (start: S): boolean => {
    if (++nodes > budget) throw new OutOfBudget();
    // Safe foundation moves never hurt, so they're made without branching.
    let s = start;
    const mark = path.length;
    for (let again = true; again;) {
      again = false;
      for (let f = 0; f < s.cols.length; f++) {
        const col = s.cols[f];
        if (col.length && safe(s, col[col.length - 1])) {
          const m: SolverMove = { k: 'tf', col: f };
          s = apply(s, m);
          path.push(m);
          again = true;
        }
      }
      if (s.p > 0 && safe(s, s.talon[s.p - 1])) {
        const m: SolverMove = { k: 'wf', q: s.p };
        s = apply(s, m);
        path.push(m);
        again = true;
      }
    }
    if (won(s)) return true;
    const k = key(s);
    if (!visited.has(k)) {
      visited.add(k);
      for (const m of moves(s, draw)) {
        path.push(m);
        if (dfs(apply(s, m))) return true;
        path.pop();
      }
    }
    path.length = mark;
    return false;
  };

  try {
    const result = dfs(fromGame(g)) ? 'win' : 'lose';
    return { result, nodes, path: result === 'win' ? path : [] };
  } catch (e) {
    if (e instanceof OutOfBudget) return { result: 'unknown', nodes, path: [] };
    throw e;
  }
}

/** How many draws take the waste from `p` cards to `q` cards (recycling as needed). */
export function drawsBetween(len: number, p: number, q: number, draw: DrawMode): number {
  let n = 0;
  while (p !== q) {
    p = p === len ? 0 : Math.min(p + draw, len);
    if (++n > 2 * len + 4) throw new Error('unreachable waste position');
  }
  return n;
}
