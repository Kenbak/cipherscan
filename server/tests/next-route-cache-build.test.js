const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '../..');
const manifestPath = path.join(repositoryRoot, '.next/prerender-manifest.json');

assert.ok(
  fs.existsSync(manifestPath),
  'Run `npm run build` before the route-cache build verification',
);

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

test('query-free core list destinations are emitted as 30-second ISR pages', () => {
  const expected = [
    '/blocks/latest',
    '/txs/latest',
    '/txs/shielded/latest',
  ];

  for (const route of expected) {
    const entry = manifest.routes?.[route];
    assert.ok(entry, `${route} is not present in the Next prerender manifest`);
    assert.equal(entry.srcRoute, route);
    assert.equal(entry.initialRevalidateSeconds, 30);
  }
});

test('query-aware archive handlers remain outside the full route cache', () => {
  for (const route of ['/blocks', '/txs', '/txs/shielded']) {
    assert.equal(
      manifest.routes?.[route],
      undefined,
      `${route} must remain dynamic so query-specific HTML is not collapsed`,
    );
  }
});

test('homepage and rich-list ISR controls remain present', () => {
  assert.equal(manifest.routes?.['/']?.initialRevalidateSeconds, 15);
  assert.equal(manifest.routes?.['/rich-list']?.initialRevalidateSeconds, 60);
});

test('detail routes retain on-demand static fallbacks for runtime ISR', () => {
  for (const route of ['/block/[height]', '/tx/[txid]', '/address/[address]']) {
    const entry = manifest.dynamicRoutes?.[route];
    assert.ok(entry, `${route} is not present in the Next dynamic prerender manifest`);
    assert.equal(entry.fallback, null, `${route} must generate uncached params on demand`);
  }
});
