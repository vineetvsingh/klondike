import { expect, test } from '@playwright/test';
import { boxOf, cardCount, open } from './helpers';

test.beforeEach(async ({ page }) => {
  // Record vibrations instead of performing them.
  await page.addInitScript(() => {
    const w = window as unknown as { __buzz: unknown[] };
    w.__buzz = [];
    Object.defineProperty(navigator, 'vibrate', { value: (p: unknown) => { w.__buzz.push(p); return true; }, configurable: true });
  });
});

test('phone layout fits, with secondary actions in a menu', async ({ page }) => {
  await open(page, { settings: { draw: 3 } });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.getByRole('button', { name: 'Daily Deal' })).toBeHidden();
  await page.getByRole('button', { name: 'More' }).tap();
  await expect(page.getByRole('menuitem')).toHaveCount(5);
  await page.getByRole('menuitem', { name: 'Stats & awards' }).tap();
  await expect(page.getByRole('heading', { name: 'Your statistics' })).toBeVisible();
});

test('games are picked from the menu, after a confirmation', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'More' }).tap();
  await page.getByRole('menuitem', { name: /Change game/ }).tap();
  const picker = page.getByRole('dialog', { name: 'Choose a game' });
  await expect(picker).toBeVisible();
  const box = await picker.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.getByRole('button', { name: /^FreeCell/ }).tap();
  await page.getByRole('button', { name: 'Switch game' }).tap();
  await expect(page.locator('.card.up')).toHaveCount(52);
});

test('tapping the stock draws three, and dragging buzzes', async ({ page }) => {
  await open(page, { settings: { draw: 3 } });
  const stock = await boxOf(page, '[data-slot="stock"]');
  await page.touchscreen.tap(stock.x + stock.w / 2, stock.y + stock.h / 2);
  await page.waitForTimeout(700);
  expect(await cardCount(page, '.card.up')).toBe(10);

  // A touch drag: pick-up vibrates (and the snap-back landing does too).
  const c = await boxOf(page, '.card.up:not(.in-stock)');
  const cdp = await page.context().newCDPSession(page);
  const point = (x: number, y: number) => [{ x, y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(c.x + c.w / 2, c.y + 8) });
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(c.x + c.w / 2 + i * 4, c.y + 8 + i * 30) });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(800);
  const buzz = await page.evaluate(() => (window as unknown as { __buzz: unknown[] }).__buzz);
  expect(buzz.length).toBeGreaterThanOrEqual(2);
});
