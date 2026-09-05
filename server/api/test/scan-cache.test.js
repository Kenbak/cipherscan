'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const routePath = path.resolve(__dirname, '../routes/scan.js');

function loadRoute(cacheDir) {
  return spawnSync(process.execPath, ['-e', `require(${JSON.stringify(routePath)})`], {
    encoding: 'utf8',
    env: {
      ...process.env,
      COMPACT_BLOCK_CACHE_DIR: cacheDir,
    },
  });
}

test('scan route creates its configured compact-block cache directory', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cipherscan-scan-cache-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cacheDir = path.join(root, 'nested', 'compact-blocks');

  const result = loadRoute(cacheDir);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.statSync(cacheDir).isDirectory(), true);
});

test('scan route degrades safely when its cache directory is not writable/usable', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cipherscan-scan-cache-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const unusablePath = path.join(root, 'not-a-directory');
  fs.writeFileSync(unusablePath, 'occupied');

  const result = loadRoute(unusablePath);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Disabling compact block cache/);
});
