// Run against the production build, not the development server.
// NETWORK_VERIFY_URL=http://127.0.0.1:3100 node scripts/verify-network-snapshot.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.NETWORK_VERIFY_URL || 'http://127.0.0.1:3100';
const url = `${base}/network`;
const response = await fetch(url);
assert.equal(response.status, 200);
const html = await response.text();
const statsResponse = await fetch('https://api.mainnet.cipherscan.app/api/network/stats');
assert.equal(statsResponse.status, 200);
const statsFixture = await statsResponse.json();
assert.equal((html.match(/<h1(?:\s|>)/g) || []).length, 1);
const browser = await chromium.launch({
  ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
});
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  context.setDefaultTimeout(20_000);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (/hydration|hydrating|Minified React error/i.test(message.text())) errors.push(message.text());
  });
  // Hydrate exactly the captured snapshot ten minutes later. Stale seeds
  // should catch up immediately and never replace the page on HTTP failure.
  await page.clock.install({ time: new Date(Date.now() + 600_000) });
  let calls = 0;
  let failed = true;
  await page.route('**/api/network/stats', async route => {
    calls++;
    if (failed) await route.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*' }, json: { error: 'verification outage' } });
    else await route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: statsFixture });
  });
  await page.route(url, route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto(url);
  console.log('Loaded cached Network page');
  const refreshDelayed = () => page.evaluate(() =>
    [...document.querySelectorAll('[role="status"]')].some(el => el.textContent.includes('Live refresh delayed')));
  const waitUntil = async predicate => {
    for (let attempt = 0; attempt < 200; attempt++) {
      if (await predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Network browser assertion timed out');
  };
  await waitUntil(refreshDelayed);
  assert.equal(calls, 1, 'stale seeded stats should fetch once on mount');
  assert.equal(await page.locator('h1').count(), 1);
  assert.ok(await page.locator('#network-overview').isVisible());
  assert.ok(await page.locator('a[href^="/block/"]').count() > 0, 'retain seeded recent blocks');
  for (const selector of ['title', 'meta[name="description"]', 'link[rel="canonical"]', 'meta[name="robots"]',
    'meta[property="og:title"]', 'meta[property="og:description"]', 'meta[property="og:url"]',
    'meta[property="og:image"]', 'meta[name="twitter:card"]', 'meta[name="twitter:title"]', 'meta[name="twitter:image"]']) {
    assert.ok(await page.locator(selector).count() > 0, `Missing ${selector}`);
  }
  assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), 'https://cipherscan.app/network');
  assert.match(await page.locator('meta[name="robots"]').getAttribute('content'), /^index, follow/);
  const schemas = (await page.locator('script[type="application/ld+json"]').allTextContents()).map(value => JSON.parse(value));
  assert.ok(schemas.some(value => value['@type'] === 'WebPage' && value.url.endsWith('/network')));
  console.log('Verified stale snapshot and refresh-failure retention');
  failed = false;
  await page.clock.fastForward(120_000);
  await waitUntil(async () => !(await refreshDelayed()));
  assert.equal(calls, 2, 'retry succeeds after backoff');
  assert.equal(await page.locator('h1').count(), 1);
  assert.equal(errors.length, 0, errors.join('\n'));
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.locator('h1').isVisible());
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  console.log('PASS: SEO, ten-minute-old hydration, immediate catch-up, last-good retention, retry recovery, mobile width, no hydration errors');
  await context.close();
} finally { await browser.close(); }
