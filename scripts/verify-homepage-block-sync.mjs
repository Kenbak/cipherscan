// Run against a local dev server. HTTP fixtures intentionally advance without WebSocket events.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
});
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => {
    localStorage.setItem('cipherscan-home-card-left', 'blocks');
    localStorage.setItem('cipherscan-home-card-right', 'blocks');
  });
  let socket;
  await context.routeWebSocket(url => !url.pathname.includes('_next'), route => { socket = route; });
  let height = 3485165;
  let suffix = 'a';
  let fail = false;
  let requests = 0;
  const hash = () => height.toString(16).padStart(63, '0') + suffix;
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/v1/blocks?limit=5', async route => {
    requests++;
    await route.fulfill({
      status: fail ? 503 : 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: Array.from({ length: 5 }, (_, index) => ({
          height: height - index, hash: index ? (height - index).toString(16).padStart(64, '0') : hash(),
          timestamp: Math.floor(Date.now() / 1000) - index * 75, transaction_count: 3, size: 1024,
        })),
        meta: { requestId: 'block-sync-test', network: 'mainnet' },
      }),
    });
  });
  const response = await page.goto(process.env.HOME_VERIFY_URL || 'http://127.0.0.1:3000', { waitUntil: 'domcontentloaded' });
  const html = await response.text();
  assert.equal((html.match(/<h1[\s>]/g) || []).length, 1);
  for (const metadata of ['rel="canonical"', 'name="robots"', 'property="og:title"', 'name="twitter:card"', 'application/ld+json']) assert.ok(html.includes(metadata), metadata);
  await page.locator('nav button.theme-toggle-btn').waitFor({ timeout: 60000 });
  async function assertSynced() {
    await page.waitForFunction(({ height, hash }) => {
      const links = [...document.querySelectorAll('.home-feed tbody tr:first-child a')];
      const hero = document.querySelector('.hero-block-link');
      const tooltip = document.querySelector('.hero-block-tooltip');
      return links.length === 2 && links.every(link => link.getAttribute('href') === `/block/${height}`)
        && hero?.getAttribute('href') === `/block/${height}` && tooltip?.textContent.includes(hash.slice(-8));
    }, { height, hash: hash() }, { timeout: 30000 });
  }
  await assertSynced();
  const beforePoll = requests;
  height += 4;
  // No socket event or focus event: allow the real 15-second fallback to catch up.
  await assertSynced();
  assert.equal(requests, beforePoll + 1, 'Two block cards should share one polling request');
  console.log('PASS missed WebSocket: polling updates both cards and hero together');

  suffix = 'b';
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await assertSynced();
  console.log('PASS same-height canonical hash replacement');

  fail = true;
  const failure = page.waitForResponse(response => response.url().includes('/v1/blocks?limit=5') && response.status() === 503);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await failure;
  await assertSynced();
  fail = false;
  if (!socket) throw new Error('Expected application WebSocket connection');
  const refreshed = page.waitForResponse(response => response.url().includes('/v1/blocks?limit=5') && response.status() === 200);
  socket.send(JSON.stringify({ type: 'new_block', data: { height: 1, hash: 'f'.repeat(64) } }));
  await refreshed;
  await assertSynced();
  console.log('PASS failed fetch retains snapshot; socket payload cannot independently replace tooltip');

  await page.locator('.hero-block-link').focus();
  await page.getByRole('tooltip').waitFor();
  assert.ok((await page.getByRole('tooltip').textContent()).includes(height.toLocaleString('en-US')));
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('tooltip').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS tooltip focus/Escape, server metadata and H1, no browser exceptions');
} finally {
  await browser.close();
}
