// Verify the rendered transaction ages against actual API JSON, not a synthetic fixture.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const url = process.env.HOME_VERIFY_URL || 'http://127.0.0.1:3100';
const browser = await chromium.launch({
  ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
});
try {
  const context = await browser.newContext();
  await context.addInitScript(() => localStorage.setItem('cipherscan-home-card-right', 'transactions'));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let wireRows;
  await page.route('**/v1/transactions?limit=5', async route => {
    const response = await route.fetch();
    assert.equal(response.status(), 200, `API ${route.request().url()}: ${await response.text()}`);
    const envelope = await response.json();
    assert.equal(envelope.meta?.network, 'mainnet');
    assert.ok(envelope.meta?.requestId, 'Missing v1 request ID');
    wireRows = envelope.data;
    await route.fulfill({ response });
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const card = page.locator('.home-feed').last();
  await card.getByRole('heading', { name: 'RECENT_TRANSACTIONS', exact: true }).waitFor();
  await card.locator('tbody tr').first().waitFor();
  assert.ok(wireRows?.length > 0, 'No real API rows received');
  for (const wire of wireRows) {
    const row = card.locator('tbody tr').filter({ has: page.locator(`a[href="/tx/${wire.txid}"]`) });
    const time = row.locator('time');
    assert.equal(await time.getAttribute('datetime'), new Date(Number(wire.block_time) * 1000).toISOString());
    assert.match(await time.textContent(), /ago|Just now/);
  }
  for (const search of await page.locator('.nav-search-compact').all()) assert.equal(await search.isVisible(), false);
  await page.goto(new URL('/txs', url).href, { waitUntil: 'domcontentloaded' });
  await page.locator('h1').filter({ hasText: 'Latest Zcash Transactions' }).waitFor();
  assert.equal(await page.locator('h1').count(), 1);
  assert.equal(await page.locator('.nav-search-compact').first().isVisible(), true);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator('.nav-search-compact').last().isVisible(), true);
  assert.deepEqual(errors, []);
  console.log(`PASS: ${wireRows.length} displayed transaction ages match the real API; navbar visibility and archive H1 pass; wire timestamp type: ${typeof wireRows[0].block_time}`);
} finally {
  await browser.close();
}
