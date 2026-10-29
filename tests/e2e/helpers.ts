import { expect, type Page } from '@playwright/test';

export interface Box { id: string | null; slot: boolean; x: number; y: number; w: number; h: number }

/** Opens the game with clean storage, optionally seeding settings, a saved game or a profile. */
export async function open(page: Page, seed: { settings?: object; game?: object; profile?: object } = {}) {
  await page.goto('/');
  await page.evaluate((s) => {
    localStorage.clear();
    localStorage.setItem('solitaire.tip.v1', 'true');
    // Keep tests deterministic: no background solving unless a test asks for it.
    localStorage.setItem('solitaire.settings.v2', JSON.stringify({ winnable: false, ...s.settings }));
    if (s.game) localStorage.setItem('solitaire.game.v2', JSON.stringify(s.game));
    if (s.profile) localStorage.setItem('solitaire.profile.v1', JSON.stringify(s.profile));
  }, seed);
  await page.reload();
  await page.waitForTimeout(seed.game ? 400 : 2400); // let the deal land
}

export const hud = async (page: Page, label: 'Time' | 'Moves' | 'Score') => {
  const text = await page.locator('.hud-stat', { hasText: label }).locator('.hud-value').innerText();
  return label === 'Time' ? text : Number(text);
};

export const cardCount = (page: Page, sel = '.card') => page.locator(sel).count();

export async function boxOf(page: Page, selector: string): Promise<Box> {
  return page.$eval(selector, (e) => {
    const r = e.getBoundingClientRect();
    return { id: (e as HTMLElement).dataset.card ?? null, slot: e.classList.contains('slot'), x: r.x, y: r.y, w: r.width, h: r.height };
  });
}

export async function hinted(page: Page): Promise<Box[]> {
  return page.$$eval('.card.hint, .slot.hint', (els) => els.map((e) => {
    const r = e.getBoundingClientRect();
    return { id: (e as HTMLElement).dataset.card ?? null, slot: e.classList.contains('slot'), x: r.x, y: r.y, w: r.width, h: r.height };
  }));
}

/** Drags from one point to another in small steps, like a hand would. */
export async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 12) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
}

/**
 * Asks for a hint and carries it out, by drag or by tap. Hinted cards come back in DOM
 * order, so group them by column: the group with several cards is the moving stack.
 */
export async function playHint(page: Page, by: 'drag' | 'tap'): Promise<boolean> {
  await page.keyboard.press('h');
  await page.waitForTimeout(150);
  const hs = await hinted(page);
  if (!hs.length) return false;
  const before = (await hud(page, 'Moves')) as number;
  if (hs.length === 1) {
    await page.mouse.click(hs[0].x + hs[0].w / 2, hs[0].y + hs[0].h / 2);
  } else {
    const cols: Record<number, Box[]> = {};
    for (const h of hs) (cols[Math.round(h.x)] ||= []).push(h);
    const groups = Object.values(cols).map((g) => g.sort((a, b) => a.y - b.y));
    const pairs = groups.length === 2 && groups.some((g) => g.length > 1)
      ? [(groups[0].length > 1 ? [groups[0][0], groups[1][0]] : [groups[1][0], groups[0][0]]) as [Box, Box]]
      : [[hs[0], hs[hs.length - 1]], [hs[hs.length - 1], hs[0]]] as [Box, Box][];
    for (const [src, dst] of pairs) {
      const s = { x: src.x + src.w / 2, y: src.y + 12 };
      if (by === 'drag') await drag(page, s, { x: dst.x + dst.w / 2, y: dst.y + dst.h * 0.55 });
      else await page.mouse.click(s.x, s.y);
      await page.waitForTimeout(650);
      if (((await hud(page, 'Moves')) as number) > before) break;
    }
  }
  await page.waitForTimeout(500);
  expect(await hud(page, 'Moves')).toBeGreaterThan(before);
  return true;
}

// ---------- Saved-game fixtures ----------

const card = (s: number, r: number, up = true) => ({ id: 'SHDC'[s] + r, suit: s, rank: r, up });

/** A Klondike game two moves per suit from finished: auto-complete takes it home. */
export function nearlyWon(extra: object = {}) {
  const foundations = [0, 1, 2, 3].map((s) => Array.from({ length: 11 }, (_, i) => card(s, i + 1)));
  const tableau = [[card(0, 13), card(1, 12)], [card(1, 13), card(0, 12)], [card(2, 13), card(3, 12)], [card(3, 13), card(2, 12)], [], [], []];
  return {
    game: {
      variant: 'klondike', stock: [], waste: [], cells: [], foundations, tableau,
      score: 410, moves: 120, draw: 1, suits: 4, started: true, won: false, dealId: 7,
      seed: null, daily: null, verified: false, usedUndo: false, usedHint: false, ...extra,
    },
    elapsed: 151,
  };
}

/** A Pyramid game whose bottom row holds K♠, 6♥, 7♣ and some twos. */
export function pyramidGame() {
  const bottom = [card(0, 13), card(1, 6), card(3, 7), card(2, 2), card(0, 2), card(1, 2), card(3, 2)];
  const used = new Set(bottom.map((c) => c.id));
  const rest = [0, 1, 2, 3].flatMap((s) => Array.from({ length: 13 }, (_, r) => card(s, r + 1))).filter((c) => !used.has(c.id));
  const tableau = [...rest.slice(0, 21), ...bottom].map((c) => [c]);
  return {
    settings: { variant: 'pyramid' },
    game: { elapsed: 0, game: {
      variant: 'pyramid', stock: rest.slice(21).map((c) => ({ ...c, up: false })), waste: [], cells: [], foundations: [[]], tableau,
      score: 0, moves: 0, draw: 1, suits: 4, passes: 0, started: true, won: false, dealId: 3,
      seed: null, daily: null, verified: false, usedUndo: false, usedHint: false,
    } },
  };
}

export const todayKey = (page: Page) => page.evaluate(() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
});

/** Collects page errors so each test can assert a clean console. */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return errors;
}
