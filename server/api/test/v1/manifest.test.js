/**
 * Inventory / manifest contract tests.
 *
 * Run: node --test server/api/test/v1/manifest.test.js
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const { MANIFEST, CLASSIFICATIONS, V1_STATUSES } = require('../../v1/inventory/manifest');

const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');

test('manifest is non-empty and covers every known route file', () => {
  assert.ok(MANIFEST.length > 50, `expected a substantial inventory, got ${MANIFEST.length} entries`);
  const files = new Set(MANIFEST.map((e) => e.file));
  assert.ok(files.has('server/api/routes/blocks.js'));
  assert.ok(files.has('server/api/routes/transactions/tx-detail.js'));
  assert.ok(files.has('server/signals/api.js'));
});

test('every entry has a valid classification and v1.status', () => {
  for (const entry of MANIFEST) {
    assert.ok(
      CLASSIFICATIONS.includes(entry.classification),
      `${entry.method} ${entry.legacyPath}: invalid classification "${entry.classification}"`
    );
    assert.ok(
      V1_STATUSES.includes(entry.v1.status),
      `${entry.method} ${entry.legacyPath}: invalid v1.status "${entry.v1.status}"`
    );
  }
});

test('every referenced legacy file actually exists in the repo', () => {
  const files = new Set(MANIFEST.map((e) => e.file));
  for (const file of files) {
    const abs = path.join(REPO_ROOT, file);
    assert.ok(fs.existsSync(abs), `manifest references missing file: ${file}`);
  }
});

test('every adapter/stub entry has a v1.path, and no two entries collide on method+path', () => {
  const seen = new Map();
  for (const entry of MANIFEST) {
    if (entry.v1.status === 'excluded') {
      assert.ok(!entry.v1.path, `${entry.legacyPath}: excluded entries should not declare a v1.path`);
      continue;
    }
    assert.ok(entry.v1.path, `${entry.method} ${entry.legacyPath}: mounted entry missing v1.path`);
    assert.match(entry.v1.path, /^\/v1\//, `${entry.v1.path}: v1 paths must start with /v1/`);
    const key = `${entry.method} ${entry.v1.path}`;
    assert.ok(!seen.has(key), `duplicate v1 route ${key} (also from ${seen.get(key)})`);
    seen.set(key, entry.legacyPath);
  }
});

test('excluded entries always explain why (notes present)', () => {
  for (const entry of MANIFEST) {
    if (entry.v1.status === 'excluded') {
      assert.ok(entry.v1.notes && entry.v1.notes.length > 10, `${entry.legacyPath}: excluded entry must have explanatory notes`);
    }
  }
});

test('stub entries always explain why they fail closed', () => {
  for (const entry of MANIFEST) {
    if (entry.v1.status === 'stub') {
      assert.ok(entry.v1.notes && entry.v1.notes.length > 10, `${entry.legacyPath}: stub entry must have explanatory notes`);
    }
  }
});

test('paid adapters explicitly preserve caller authentication', () => {
  for (const entry of MANIFEST.filter(e => e.classification === 'private')) {
    assert.equal(entry.v1.status, 'adapter');
    assert.equal(entry.v1.forwardPaymentAuth, true);
  }
});

test('every public-classified entry has an implemented adapter or native handler (complete public coverage requirement)', () => {
  for (const entry of MANIFEST) {
    if (entry.classification === 'public') {
      assert.ok(
        ['adapter', 'native'].includes(entry.v1.status),
        `${entry.method} ${entry.legacyPath}: public endpoints must be adapters, not "${entry.v1.status}" — either implement the adapter (with validation/rate-limiting if needed) or reclassify with concrete product evidence`
      );
    }
  }
});

test('the two scan endpoints are public adapters with v1-layer cost validation AND rate limiting (not blanket-proxied)', () => {
  for (const legacyPath of ['/api/scan/orchard', '/api/lightwalletd/scan']) {
    const entry = MANIFEST.find((e) => e.legacyPath === legacyPath);
    assert.ok(entry, `expected a manifest entry for ${legacyPath}`);
    assert.equal(entry.classification, 'public');
    assert.equal(entry.v1.status, 'adapter');
    assert.ok(entry.v1.validateKey, `${legacyPath}: expected a validateKey (v1-layer cost/range validation)`);
    assert.ok(entry.v1.rateLimitKey, `${legacyPath}: expected a rateLimitKey (endpoint-specific rate limiting)`);
  }
});

test('the ownership-protected DELETE endpoint explicitly forwards the node token without service-key privilege', () => {
  const entry = MANIFEST.find((e) => e.legacyPath === '/api/crosslink/fork-monitor/report/:name' && e.method === 'DELETE');
  assert.ok(entry, 'expected to find the fork-monitor report DELETE entry');
  assert.equal(entry.v1.status, 'adapter');
  assert.equal(entry.auth, 'node-token');
  assert.equal(entry.v1.forwardNodeToken, true);
});

test('classification counts are reported (informational; also guards against silent manifest shrinkage)', () => {
  const counts = {};
  for (const c of CLASSIFICATIONS) counts[c] = 0;
  for (const entry of MANIFEST) counts[entry.classification]++;
  assert.ok(counts.public >= 70, `expected at least 70 public entries, got ${counts.public}`);
  assert.ok(counts.private >= 3);
  assert.ok(counts.internal >= 2);
  assert.ok(counts.ops >= 2);
  assert.ok(counts.deprecated >= 1);
});

test('list-shaped adapter entries declare a supported collection and pagination source', () => {
  for (const entry of MANIFEST) {
    if (entry.v1.status === 'adapter' && entry.v1.shape === 'list') {
      assert.ok(['blocks', 'transactions', 'flows'].includes(entry.v1.listKey));
      assert.equal(entry.v1.paginationKey, 'pagination');
      assert.ok(entry.v1.listKey, `${entry.v1.path}: list shape requires listKey`);
    }
  }
});
