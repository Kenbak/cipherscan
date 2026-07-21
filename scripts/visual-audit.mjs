#!/usr/bin/env node
/**
 * Visual audit — screenshots key pages in both themes at two viewports.
 *
 * Usage:
 *   npm run visual:audit                 # against http://localhost:3000
 *   BASE_URL=https://... npm run visual:audit
 *
 * Output: screenshots/visual-audit/<page>-<theme>-<viewport>.png
 * Compare the folder before/after a styling change (e.g. with a diff tool
 * or by eye) to catch regressions.
 *
 * Requires Playwright: npm i -D playwright && npx playwright install chromium
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const OUT_DIR = join(new URL('..', import.meta.url).pathname, 'screenshots', 'visual-audit');

// Tier 1 + Tier 2 pages — the high-traffic surfaces
const PAGES = [
  ['home', '/'],
  ['txs', '/txs'],
  ['blocks', '/blocks'],
  ['mempool', '/mempool'],
  ['privacy', '/privacy'],
  ['pools', '/pools'],
  ['turnstile', '/turnstile'],
  ['ironwood', '/ironwood'],
  ['mining', '/mining'],
  ['network', '/network'],
  ['charts', '/charts'],
];

const VIEWPORTS = [
  ['desktop', { width: 1440, height: 900 }],
  ['mobile', { width: 375, height: 812 }],
];

const THEMES = ['dark', 'light'];

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('Playwright is not installed. Run:\n  npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
try {
  for (const [vpName, viewport] of VIEWPORTS) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();

    for (const [name, path] of PAGES) {
      for (const theme of THEMES) {
        await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => {});
        await page.evaluate((t) => {
          document.documentElement.classList.remove('dark', 'light');
          document.documentElement.classList.add(t);
        }, theme);
        await page.waitForTimeout(800); // settle animations/theme transition
        const file = join(OUT_DIR, `${name}-${theme}-${vpName}.png`);
        await page.screenshot({ path: file, fullPage: false });
        console.log(`✓ ${name} ${theme} ${vpName}`);
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(`\nScreenshots written to ${OUT_DIR}`);
