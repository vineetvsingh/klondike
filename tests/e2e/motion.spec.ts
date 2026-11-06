import { expect, test, type Page } from '@playwright/test';
import { drag, nearlyWon, open, watchErrors } from './helpers';

/** Every card's place on the table, the side it shows, and anything keeping it in motion. */
const table = (page: Page) => page.$$eval('.card', (els) => els.map((e) => {
  const el = e as HTMLElement;
  const r = el.getBoundingClientRect();
  return {
    id: el.dataset.card,
    x: Math.round(r.x),
    y: Math.round(r.y),
    side: el.dataset.side,
    moving: 'fly' in el.dataset || 'flip' in el.dataset || el.getAnimations({ subtree: true }).length > 0,
  };
}));

/** Waits for the table to come to rest. Nothing may stay promoted or running once it has. */
const settled = (page: Page) =>
  expect.poll(async () => (await table(page)).filter((c) => c.moving).length, { timeout: 8000 }).toBe(0);

/** Wherever play has got to, reloading the saved game must put every card in the same place. */
async function expectSameAfterReload(page: Page) {
  await settled(page);
  const now = await table(page);
  await page.waitForTimeout(500); // let the save land
  await page.reload();
  await expect.poll(() => table(page), { timeout: 8000 }).toEqual(now);
}

/** Records, from now on, every property animated anywhere on the page. */
const watchAnimatedProperties = (page: Page) => page.evaluate(() => {
  const seen = new Set<string>();
  const skip = new Set(['offset', 'computedOffset', 'easing', 'composite']);
  const sample = () => {
    for (const a of document.getAnimations()) {
      const effect = a.effect as KeyframeEffect | null;
      if (!effect) continue;
      for (const frame of effect.getKeyframes()) {
        for (const prop of Object.keys(frame)) {
          if (skip.has(prop) || prop === 'transform' || prop === 'opacity') continue;
          const el = effect.target as HTMLElement | null;
          seen.add(`${prop} on .${el?.className}${effect.pseudoElement ?? ''}`);
        }
      }
    }
    requestAnimationFrame(sample);
  };
  sample();
  (window as unknown as { costly: Set<string> }).costly = seen;
});
const animatedProperties = (page: Page) =>
  page.evaluate(() => [...(window as unknown as { costly: Set<string> }).costly]);

test('a resting table has no layers of its own and nothing running', async ({ page }) => {
  await open(page, { settings: { variant: 'spider', suits: 2 } });
  await settled(page);
  expect(await table(page)).toHaveLength(104);
});

// Anything else repaints on every frame, which is what made the game lag.
test('only transform and opacity ever animate, from the deal to the win dialog', async ({ page }) => {
  await open(page);
  await watchAnimatedProperties(page);
  await page.keyboard.press('n');
  await page.waitForTimeout(2400);
  await page.keyboard.press('d');
  await page.keyboard.press('h');
  await page.waitForTimeout(500);
  await page.keyboard.press('u');
  await page.waitForTimeout(500);
  expect(await animatedProperties(page)).toEqual([]);

  await open(page, { game: nearlyWon() });
  await watchAnimatedProperties(page);
  await expect(page.getByRole('heading', { name: 'Beautifully played.' })).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(2500);
  expect(await animatedProperties(page)).toEqual([]);
});

test('moves interrupted at any point still end exactly in place', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page);
  await settled(page);
  const start = await table(page);
  for (let i = 0; i < 6; i++) { await page.keyboard.press('d'); await page.waitForTimeout(30); }
  for (let i = 0; i < 6; i++) { await page.keyboard.press('u'); await page.waitForTimeout(30); }
  await expect.poll(() => table(page), { timeout: 8000 }).toEqual(start);

  // Now reverse a single card while it's still turning over.
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('d'); await page.waitForTimeout(70);
    await page.keyboard.press('u'); await page.waitForTimeout(70);
  }
  await expect.poll(() => table(page), { timeout: 8000 }).toEqual(start);
  expect(errors).toEqual([]);
});

test('a card grabbed in mid-flight ends up where the game says it is', async ({ page }) => {
  await open(page);
  await settled(page);
  // Sent from inside the page, so a busy machine can't let the flight finish before we look.
  const flying = await page.evaluate(() => new Promise<{ x: number; y: number }>((resolve) => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
    const look = () => {
      const card = document.querySelector('.card[data-fly]');
      if (!card) { requestAnimationFrame(look); return; }
      const r = card.getBoundingClientRect();
      resolve({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
    };
    look();
  }));
  await drag(page, flying, { x: flying.x + 40, y: flying.y + 420 });
  await expectSameAfterReload(page);
});

test('a window resized mid-flight still lays out correctly', async ({ page }) => {
  await open(page);
  await settled(page);
  await page.keyboard.press('d');
  await page.setViewportSize({ width: 1000, height: 640 });
  await expectSameAfterReload(page);
});
