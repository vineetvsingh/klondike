import { rowOf, ROWS } from './rules/pyramid';
import type { Card, GameState, VariantId } from './types';

export interface Point { x: number; y: number }

export interface Layout {
  variant: VariantId;
  w: number;
  h: number;
  gap: number;
  cw: number;
  ch: number;
  compact: boolean;
  stock: Point | null;
  waste: Point | null;
  /** Where a fresh deal comes from (the stock, or the top centre when there is none). */
  deck: Point;
  cells: Point[];
  found: Point[];
  tab: Point[];
}

export interface Target extends Point {
  z: number;
  up: boolean;
  buried: boolean; // sits exactly under another card, so it drops its shadow
  inStock: boolean;
  pile: string; // "tableau:3" etc., to tell which pile a card came from
}

const COLUMNS: Record<VariantId, number> = { klondike: 7, freecell: 8, spider: 10, pyramid: 7 };
/** Table height in card heights each game needs, which caps the card size on short screens. */
const DEPTH: Record<VariantId, number> = { klondike: 4.1, freecell: 4.1, spider: 4.1, pyramid: 5.2 };
/** Each row overlaps the one above by about half a card, opening up a little on tall screens. */
const PYRAMID_STEP = [0.5, 0.68] as const;

export function computeLayout(w: number, h: number, variant: VariantId): Layout | null {
  if (w < 60 || h < 60) return null;
  const cols = COLUMNS[variant];
  const gap = Math.round(Math.max(cols > 7 ? 4 : 6, Math.min(22, w * (cols > 7 ? 0.014 : 0.018))));
  let cw = (w - gap * (cols + 1)) / cols;
  cw = Math.min(cw, 128, (h - gap * 3) / (1.4 * DEPTH[variant]));
  cw = Math.floor(Math.max(cw, 30));
  const ch = Math.round(cw * 1.4);
  const ox = Math.round((w - (cw * cols + gap * (cols - 1))) / 2);
  const oy = Math.round(gap * 0.75);
  const colX = (i: number) => ox + i * (cw + gap);
  const tabY = oy + ch + Math.round(gap * 1.4);
  const range = (from: number, n: number) => Array.from({ length: n }, (_, i) => ({ x: colX(from + i), y: oy }));

  const base = {
    variant, w, h, gap, cw, ch,
    compact: cw < 68,
    tab: range(0, cols).map((p) => ({ x: p.x, y: tabY })),
  };
  switch (variant) {
    case 'klondike':
      return { ...base, stock: range(0, 1)[0], waste: range(1, 1)[0], deck: range(0, 1)[0], cells: [], found: range(3, 4) };
    case 'freecell':
      return { ...base, stock: null, waste: null, deck: { x: Math.round(w / 2 - cw / 2), y: oy }, cells: range(0, 4), found: range(4, 4) };
    case 'spider':
      return { ...base, stock: range(0, 1)[0], waste: null, deck: range(0, 1)[0], cells: [], found: range(2, 8) };
    case 'pyramid': {
      const tab: Point[] = [];
      const room = (h - tabY - ch - gap) / ((ROWS - 1) * ch);
      const step = Math.min(PYRAMID_STEP[1], Math.max(PYRAMID_STEP[0], room * 0.8));
      for (let r = 0; r < ROWS; r++) {
        const rowX = Math.round(w / 2 - ((r + 1) * cw + r * gap) / 2);
        for (let c = 0; c <= r; c++) tab.push({ x: rowX + c * (cw + gap), y: Math.round(tabY + r * ch * step) });
      }
      return { ...base, tab, stock: range(0, 1)[0], waste: range(1, 1)[0], deck: range(0, 1)[0], cells: [], found: range(6, 1) };
    }
  }
}

/** Vertical fan spacing for a column, squeezed when the column would run off the table. */
function fanOffsets(col: Card[], L: Layout) {
  let down = L.ch * 0.11;
  let up = L.ch * 0.28;
  let nd = 0;
  let nu = 0;
  for (let i = 0; i < col.length - 1; i++) {
    if (col[i].up) nu++;
    else nd++;
  }
  const avail = Math.max(0, L.h - L.tab[0].y - L.ch - L.gap);
  if (nd * down + nu * up > avail) {
    down = Math.max(L.ch * 0.05, Math.min(down, (avail - nu * up) / Math.max(nd, 1)));
    if (nd * down + nu * up > avail) up = Math.max(L.ch * 0.12, (avail - nd * down) / Math.max(nu, 1));
  }
  return { down, up };
}

/** Where the next card would land on top of a column. */
export function landingY(col: Card[], L: Layout, t: number, targets: Map<string, Target>) {
  if (!col.length) return L.tab[t].y;
  const last = targets.get(col[col.length - 1].id);
  return (last?.y ?? L.tab[t].y) + fanOffsets([...col, col[col.length - 1]], L).up;
}

export function computeTargets(g: GameState, L: Layout): Map<string, Target> {
  const out = new Map<string, Target>();
  const set = (c: Card, x: number, y: number, z: number, pile: string, buried = false, inStock = false) =>
    out.set(c.id, { x, y, z, up: c.up, buried, inStock, pile });

  if (L.stock) {
    // Spider keeps its stock in visible piles of ten, one per deal still to come.
    const group = g.variant === 'spider' ? 10 : g.stock.length || 1;
    const step = L.cw * (L.compact ? 0.1 : 0.08);
    g.stock.forEach((c, i) => {
      const k = Math.floor(i / group);
      set(c, L.stock!.x + k * step, L.stock!.y, i + 1, 'stock', (i + 1) % group !== 0 && i < g.stock.length - 1, true);
    });
  }

  if (L.waste) {
    const wn = g.waste.length;
    const fanCount = g.variant === 'klondike' && g.draw === 3 ? Math.min(3, wn) : 1;
    const fan = L.cw * (L.compact ? 0.52 : 0.24); // compact indices sit side by side and need more room
    g.waste.forEach((c, i) => {
      const k = i - (wn - fanCount);
      set(c, L.waste!.x + (k > 0 ? k * fan : 0), L.waste!.y, i + 1, 'waste', k < 0);
    });
  }

  g.cells.forEach((cell, i) => cell.forEach((c) => set(c, L.cells[i].x, L.cells[i].y, 1, `cell:${i}`)));

  g.foundations.forEach((pile, f) =>
    pile.forEach((c, i) => set(c, L.found[f].x, L.found[f].y, i + 1, `foundation:${f}`, i < pile.length - 1)));

  if (g.variant === 'pyramid') {
    // Lower rows overlap higher ones, so they sit on top.
    g.tableau.forEach((pile, i) => pile.forEach((c) => set(c, L.tab[i].x, L.tab[i].y, rowOf(i) + 1, `tableau:${i}`)));
    return out;
  }

  g.tableau.forEach((col, t) => {
    const { down, up } = fanOffsets(col, L);
    let y = L.tab[t].y;
    col.forEach((c, i) => {
      set(c, L.tab[t].x, Math.round(y), i + 1, `tableau:${t}`);
      y += c.up ? up : down;
    });
  });

  return out;
}

/**
 * The win flourish: cards spiral out of the foundations into a sunflower
 * (phyllotaxis) rosette in the middle of the table. Returns position and spin per card.
 */
export function rosette(g: GameState, L: Layout) {
  const order: Card[] = [];
  const depth = Math.max(...g.foundations.map((f) => f.length));
  for (let d = 0; d < depth; d++) {
    for (const pile of g.foundations) {
      const c = pile[pile.length - 1 - d];
      if (c) order.push(c);
    }
  }
  const n = order.length;
  const cx = L.w / 2;
  const cy = L.h / 2;
  const rMax = Math.max(L.cw, Math.min(L.w, L.h) / 2 - L.ch * 0.5);
  const c = rMax / Math.sqrt(n);
  const golden = Math.PI * (3 - Math.sqrt(5));
  return order.map((card, k) => {
    const j = n - 1 - k; // the first cards out travel to the outer ring; the rosette fills inward
    const r = c * Math.sqrt(j + 0.6);
    const a = j * golden;
    return {
      id: card.id,
      x: Math.round(cx + r * Math.cos(a) - L.cw / 2),
      y: Math.round(cy + r * Math.sin(a) - L.ch / 2),
      spin: ((a * 180) / Math.PI + 90) % 360,
      z: 2000 + k,
      order: k,
    };
  });
}
