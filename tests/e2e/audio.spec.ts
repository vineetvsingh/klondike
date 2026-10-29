import { expect, test, type Page } from '@playwright/test';
import { boxOf, nearlyWon, open } from './helpers';

/**
 * Taps the game's final audio output with an AnalyserNode and counts source nodes
 * started, so we can check that actions make sound (and mute makes none) without
 * listening.
 */
function tapAudio() {
  const w = window as unknown as { __peak: number; __starts: number; __an?: AnalyserNode };
  w.__peak = 0;
  w.__starts = 0;
  const connect = AudioNode.prototype.connect as (this: AudioNode, ...a: unknown[]) => AudioNode;
  AudioNode.prototype.connect = function (this: AudioNode, dest: unknown, ...rest: unknown[]) {
    if (dest instanceof AudioDestinationNode && !w.__an) {
      const an = this.context.createAnalyser();
      an.fftSize = 2048;
      connect.call(this, an);
      w.__an = an;
      const buf = new Float32Array(2048);
      const loop = () => {
        an.getFloatTimeDomainData(buf);
        for (let i = 0; i < buf.length; i++) w.__peak = Math.max(w.__peak, Math.abs(buf[i]));
        setTimeout(loop, 10);
      };
      loop();
    }
    return connect.call(this, dest, ...rest);
  } as typeof AudioNode.prototype.connect;
  for (const C of [AudioBufferSourceNode, OscillatorNode]) {
    const start = C.prototype.start;
    C.prototype.start = function (this: AudioScheduledSourceNode, ...a: [number?]) {
      w.__starts++;
      return start.apply(this, a);
    };
  }
}

async function measure(page: Page, action: () => Promise<unknown>, wait = 700) {
  await page.evaluate(() => {
    const w = window as unknown as { __peak: number; __starts: number; __s0: number };
    w.__peak = 0;
    w.__s0 = w.__starts;
  });
  await action();
  await page.waitForTimeout(wait);
  return page.evaluate(() => {
    const w = window as unknown as { __peak: number; __starts: number; __s0: number };
    return { peak: w.__peak, nodes: w.__starts - w.__s0 };
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(tapAudio);
});

test('card actions make sound at a sensible level', async ({ page }) => {
  await open(page);
  await page.mouse.click(5, 300); // first gesture unlocks audio
  const stock = await boxOf(page, '[data-slot="stock"]');
  const draw = await measure(page, () => page.mouse.click(stock.x + stock.w / 2, stock.y + stock.h / 2));
  expect(draw.nodes).toBeGreaterThan(0);
  expect(draw.peak).toBeGreaterThan(0.02);
  expect(draw.peak).toBeLessThan(0.9); // headroom: never near clipping

  const deal = await measure(page, () => page.keyboard.press('n'), 2200);
  expect(deal.nodes).toBeGreaterThan(20);
});

test('mute silences everything', async ({ page }) => {
  await open(page);
  await page.mouse.click(5, 300);
  await page.keyboard.press('m');
  await page.waitForTimeout(150);
  const stock = await boxOf(page, '[data-slot="stock"]');
  const muted = await measure(page, () => page.mouse.click(stock.x + stock.w / 2, stock.y + stock.h / 2));
  expect(muted.peak).toBeLessThan(0.001);
  // The setting persists across a reload.
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('solitaire.settings.v2')!).sound)).toBe(false);
});

test('a win plays chimes and a fanfare', async ({ page }) => {
  await open(page, { game: nearlyWon() });
  await page.mouse.click(5, 300);
  const win = await measure(page, async () => {}, 3500);
  expect(win.nodes).toBeGreaterThan(30);
  expect(win.peak).toBeGreaterThan(0.05);
});
