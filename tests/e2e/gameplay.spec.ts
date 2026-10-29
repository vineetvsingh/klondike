import { expect, test } from '@playwright/test';
import { boxOf, cardCount, drag, hud, nearlyWon, open, playHint, pyramidGame, todayKey, watchErrors } from './helpers';

test.describe('Klondike', () => {
  test('deals, then plays hinted moves by drag and by tap', async ({ page }) => {
    const errors = watchErrors(page);
    await open(page);
    expect(await cardCount(page)).toBe(52);
    expect(await cardCount(page, '.card.up')).toBe(7);
    for (let step = 0; step < 8; step++) {
      if (!(await playHint(page, step % 2 ? 'tap' : 'drag'))) break;
    }
    expect(errors).toEqual([]);
  });

  test('an illegal drop springs back home', async ({ page }) => {
    await open(page);
    const c = await boxOf(page, '.card.up:not(.in-stock)');
    const before = await hud(page, 'Moves');
    await drag(page, { x: c.x + c.w / 2, y: c.y + 10 }, { x: c.x + 40, y: c.y + 380 }, 8);
    await page.waitForTimeout(800);
    const after = await boxOf(page, `[data-card="${c.id}"]`);
    expect(Math.abs(after.x - c.x)).toBeLessThan(2);
    expect(Math.abs(after.y - c.y)).toBeLessThan(2);
    expect(await hud(page, 'Moves')).toBe(before);
  });

  test('draws from the stock and undoes it', async ({ page }) => {
    await open(page);
    const stock = await boxOf(page, '[data-slot="stock"]');
    await page.mouse.click(stock.x + stock.w / 2, stock.y + stock.h / 2);
    await page.waitForTimeout(500);
    expect(await hud(page, 'Moves')).toBe(1);
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);
    expect(await hud(page, 'Moves')).toBe(0);
  });

  test('auto-completes, spirals into a rosette and records the win', async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, { game: nearlyWon() });
    await expect(page.getByRole('heading', { name: 'Beautifully played.' })).toBeVisible({ timeout: 8000 });
    // The rosette: cards leave the foundations and pick up a spin.
    const spun = await page.$$eval('.card', (els) => els.filter((e) => /rotate\((?!0deg)/.test((e as HTMLElement).style.transform)).length);
    expect(spun).toBeGreaterThan(40);
    await expect(page.getByText('First Light')).toBeVisible();
    await expect(page.getByText('New card back: Sunburst')).toBeVisible();
    const profile = await page.evaluate(() => JSON.parse(localStorage.getItem('solitaire.profile.v1')!));
    expect(profile.totals.klondike.won).toBe(1);
    expect(profile.records).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  test('"Winnable only" deals a deal the solver has proven', async ({ page }) => {
    await open(page, { settings: { winnable: true } });
    await page.keyboard.press('n');
    await expect(page.locator('.verified')).toBeVisible({ timeout: 20000 });
  });
});

test.describe('Winnable deals in other games', () => {
  for (const settings of [{ variant: 'freecell' }, { variant: 'spider', suits: 1 }, { variant: 'pyramid' }]) {
    test(`${settings.variant} deals are proven too`, async ({ page }) => {
      await open(page, { settings: { ...settings, winnable: true } });
      await page.keyboard.press('n');
      await expect(page.locator('.verified')).toBeVisible({ timeout: 20000 });
    });
  }
});

test.describe('FreeCell', () => {
  test('deals face-up and accepts a card in a free cell', async ({ page }) => {
    await open(page, { settings: { variant: 'freecell' } });
    expect(await cardCount(page)).toBe(52);
    expect(await cardCount(page, '.card.up')).toBe(52);
    expect(await page.locator('.slot.cell').count()).toBe(4);
    // The last card dealt (column 0's top) is always free to move.
    const tops = await page.$$eval('.card', (els) => els.map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, z: Number(getComputedStyle(e).zIndex) };
    }));
    const col0 = tops.filter((t) => Math.abs(t.x - Math.min(...tops.map((u) => u.x))) < 2).sort((a, b) => b.y - a.y)[0];
    const cell = await boxOf(page, '.slot.cell:nth-of-type(1)');
    await drag(page, { x: col0.x + col0.w / 2, y: col0.y + col0.h / 2 }, { x: cell.x + cell.w / 2, y: cell.y + cell.h / 2 });
    await page.waitForTimeout(600);
    expect(await hud(page, 'Moves')).toBe(1);
  });
});

test.describe('Spider', () => {
  test('deals 104 cards and a new row from the stock', async ({ page }) => {
    await open(page, { settings: { variant: 'spider', suits: 1 } });
    expect(await cardCount(page)).toBe(104);
    expect(await cardCount(page, '.card.up')).toBe(10);
    const stock = await boxOf(page, '[data-slot="stock"]');
    await page.mouse.click(stock.x + stock.w / 2, stock.y + stock.h / 2);
    await page.waitForTimeout(1200);
    expect(await cardCount(page, '.card.up')).toBe(20);
    expect(await hud(page, 'Score')).toBe(499);
  });
});

test.describe('Pyramid', () => {
  test('deals 28 cards in rows, then clears a king and a pair', async ({ page }) => {
    await open(page, { settings: { variant: 'pyramid' } });
    expect(await cardCount(page)).toBe(52);
    expect(await cardCount(page, '.card.up')).toBe(28);
    const rows = await page.$$eval('.card.up', (els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().y))).size);
    expect(rows).toBe(7);

    await open(page, pyramidGame());
    const at = (id: string) => boxOf(page, `[data-card="${id}"]`);
    // A king leaves on its own with a tap.
    const king = await at('S13');
    await page.mouse.click(king.x + king.w / 2, king.y + king.h / 2);
    await page.waitForTimeout(700);
    expect(await hud(page, 'Moves')).toBe(1);
    expect(await hud(page, 'Score')).toBe(5);
    // 6 + 7 = 13: drag one onto the other and both go.
    const [six, seven] = [await at('H6'), await at('C7')];
    await drag(page, { x: six.x + six.w / 2, y: six.y + six.h / 2 }, { x: seven.x + seven.w / 2, y: seven.y + seven.h / 2 });
    await page.waitForTimeout(700);
    expect(await hud(page, 'Moves')).toBe(2);
    expect(await hud(page, 'Score')).toBe(15);
    // A pair that doesn't make 13 springs back.
    const [a, b] = [await at('D2'), await at('S2')];
    await drag(page, { x: a.x + a.w / 2, y: a.y + a.h / 2 }, { x: b.x + b.w / 2, y: b.y + b.h / 2 });
    await page.waitForTimeout(700);
    expect(await hud(page, 'Moves')).toBe(2);
  });
});

test.describe('Daily Deal', () => {
  test('is the same deal for everyone and can be shared once solved', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await open(page);
    await page.getByRole('button', { name: 'Daily Deal' }).click();
    await page.getByRole('button', { name: 'Play today' }).click();
    await expect(page.locator('.brand-mode')).toContainText('Daily #', { timeout: 20000 });
    const first = await page.evaluate(() => JSON.parse(localStorage.getItem('solitaire.game.v2')!).game.seed);

    // A second visitor (fresh storage) gets the same seed.
    await open(page);
    await page.getByRole('button', { name: 'Daily Deal' }).click();
    await page.getByRole('button', { name: 'Play today' }).click();
    await expect(page.locator('.brand-mode')).toContainText('Daily #', { timeout: 20000 });
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('solitaire.game.v2')!).game.seed)).toBe(first);

    // Finish a daily: the calendar marks today and the result can be shared.
    const today = await todayKey(page);
    await open(page, { game: nearlyWon({ daily: today }) });
    await expect(page.getByRole('heading', { name: /Daily #\d+ solved/ })).toBeVisible({ timeout: 8000 });
    await page.getByRole('button', { name: 'Share' }).click();
    await expect(page.locator('.toast')).toContainText(/Solitaire Daily #\d+ · 2:3\d · 12\d moves/);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^Solitaire Daily #\d+ · /);
    await page.getByRole('button', { name: 'Deal again' }).click();
    await page.getByRole('button', { name: 'Daily Deal' }).click();
    await expect(page.locator('.cal-day.today.done')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Share result' })).toBeVisible();
  });
});

test.describe('Stats, achievements and unlocks', () => {
  const records = Array.from({ length: 24 }, (_, i) => ({
    v: i % 3 ? 'klondike' : 'freecell', mode: i % 3 ? 1 : 0, won: i % 4 !== 0, time: 120 + i * 17, moves: 90 + i, score: 400, at: Date.UTC(2026, 9, 1 + i),
  }));
  const profile = {
    records,
    totals: { klondike: { played: 16, won: 12 }, freecell: { played: 8, won: 6 }, spider: { played: 0, won: 0 } },
    best: { klondike: { time: 137, score: 400, moves: 91 }, freecell: { time: 120, score: 400, moves: 90 }, spider: { time: null, score: null, moves: null } },
    streak: 2, bestStreak: 5, achievements: { 'first-win': 1, 'freecell': 1 }, daily: {},
  };

  test('charts render, with table views and hover readouts', async ({ page }) => {
    await open(page, { profile });
    await page.keyboard.press('s');
    await expect(page.getByRole('heading', { name: 'Your statistics' })).toBeVisible();
    await expect(page.locator('.chart')).toHaveCount(3);
    await expect(page.locator('.chart .line')).toHaveCount(1);
    expect(await page.locator('.chart .bar').count()).toBeGreaterThan(2);
    await expect(page.locator('.runs li')).toHaveCount(5);
    await page.locator('.chart .hit').first().hover();
    await expect(page.locator('.chart-tip')).toContainText(/Game \d+/);
    await page.getByRole('button', { name: 'FreeCell' }).click();
    await expect(page.locator('.stat-tile', { hasText: 'Played' })).toContainText('8');
    await page.getByRole('button', { name: 'Awards' }).click();
    await expect(page.locator('.award')).toHaveCount(17);
    await expect(page.locator('.award.got')).toHaveCount(2);
  });

  test('card backs and felts unlock with wins', async ({ page }) => {
    await open(page, { profile });
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('button', { name: /Gilded, unlocks after 20 wins/ })).toBeDisabled();
    await page.getByRole('button', { name: 'Constellation', exact: true }).click();
    await expect(page.locator('.board')).toHaveAttribute('data-back', 'constellation');
    await page.getByRole('button', { name: 'Copper', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'copper');
  });
});
