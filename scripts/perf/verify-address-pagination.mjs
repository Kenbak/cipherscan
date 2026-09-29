// Run against a local frontend backed by an address API fixture (never production).
// Example: ADDRESS_PAGINATION_BASE_URL=http://localhost:3105 node scripts/perf/verify-address-pagination.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ADDRESS_PAGINATION_BASE_URL;
if (!base || !['localhost', '127.0.0.1'].includes(new URL(base).hostname)) {
  throw new Error('Set ADDRESS_PAGINATION_BASE_URL to a local frontend with fixture API data');
}
const address = 't3cFfPt1Bcvgez9ZbMBFWeZsskxTkPzGCow';
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
try {
  const page = await browser.newPage();
  const held = [];
  const counts = { address: 0, crosschain: 0, price: 0 };
  const errors = [];
  const pending = new Set();
  page.on('request', req => pending.add(req.url()));
  page.on('requestfinished', req => pending.delete(req.url()));
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error') console.error('browser:', msg.text()); });
  page.on('requestfailed', req => console.error('request failed:', req.url(), req.failure()));
  await page.route(/\/(?:api|v1)\//, async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/price') || url.pathname.includes('/crosschain/')) {
      counts[url.pathname.includes('/crosschain/') ? 'crosschain' : 'price']++;
      held.push(route);
      return; // Keep optional enrichments pending while exercising pagination.
    }
    if (url.pathname === `/api/address/${address}` || url.pathname === `/v1/addresses/${address}`) counts.address++;
    await route.continue();
  });
  await page.goto(`${base}/address/${address}`, { waitUntil: 'domcontentloaded' });
  const next = page.locator('a[title="Next page"], a[aria-label="Next page"]');
  await next.waitFor({ timeout: 30000 }).catch(async error => {
    console.error({ counts, errors, pending: [...pending], body: (await page.locator('body').innerText()).slice(-4000) });
    throw error;
  });
  assert.ok(counts.crosschain > 0, 'cross-chain enrichment is still pending');
  const before = { ...counts };
  const started = Date.now();
  await next.click();
  await page.waitForURL(url => url.searchParams.get('page') === '2');
  assert.ok(new URL(page.url()).searchParams.get('cursor'), 'Next carries an opaque snapshot cursor');
  await page.locator('a[title="Previous page"], a[aria-label="Previous page"]').waitFor();
  assert.equal(counts.address, before.address + 1, 'one address request per page change');
  assert.equal(counts.crosschain, before.crosschain, 'pagination does not refetch cross-chain activity');
  assert.equal(counts.price, before.price, 'pagination does not refetch price');
  const firstRow = await page.locator('main a[href^="/tx/"]').first().getAttribute('href');
  await page.locator('a[aria-label="Last page"]').click();
  await page.waitForURL(url => url.searchParams.get('page') === '3');
  await page.locator('main a[href^="/tx/3333"]').first().waitFor();
  await page.locator('a[aria-label="Previous page"]').click();
  await page.waitForURL(url => url.searchParams.get('page') === '2');
  await page.locator(`main a[href="${firstRow}"]`).first().waitFor();
  // Back/forward retain the existing crawlable URL contract.
  await page.goBack({ waitUntil: 'domcontentloaded' });
  await page.waitForURL(url => url.searchParams.get('page') === '3');
  await page.goForward({ waitUntil: 'domcontentloaded' });
  await page.locator('a[title="Previous page"], a[aria-label="Previous page"]').waitFor();
  assert.equal(counts.crosschain, before.crosschain);
  assert.equal(counts.price, before.price);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: process.env.ADDRESS_PAGINATION_SCREENSHOT || '/tmp/address-pagination-verified.png', fullPage: true });
  console.log(JSON.stringify({ base, passed: true, counts, navigationRoundTripMs: Date.now() - started, note: 'Local fixture, optional API requests deliberately held pending; not a production latency benchmark.' }));
  for (const route of held) await route.abort().catch(() => {});
} finally {
  await browser.close();
}
