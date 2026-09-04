/**
 * Regression test for the P0 requirement: no client-facing API response may
 * leak a raw internal exception message/stack.
 *
 * Two layers of protection:
 *
 * 1. A static source scan over every file under `server/api/routes/**` plus
 *    `server/api/server.js`, flagging any JSON-response field assigned
 *    directly from a caught exception's `.message`/`.stack` (with or without
 *    a `|| 'fallback'`), e.g. `error: error.message`, `message: err.stack`.
 *    This guards against the pattern being reintroduced by a future edit,
 *    even in a route this file doesn't exercise at runtime.
 *
 *    It deliberately does NOT flag:
 *      - `console.error(...)` / `console.warn(...)` logging (server-log-only)
 *      - control-flow checks like `if (error.message.includes('not found'))`
 *      - `result.error` forwarding of an already-safe, hand-authored string
 *        produced by a helper (not a raw exception)
 *
 * 2. Runtime tests that mount representative real route handlers, force an
 *    Error with a sensitive-looking message, and assert the sensitive text
 *    never appears anywhere in the JSON response body — only the stable,
 *    route-specific safe fallback text does.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const express = require('express');

const repoRoot = path.resolve(__dirname, '..', '..');
const routesDir = path.join(repoRoot, 'server', 'api', 'routes');
const serverJsPath = path.join(repoRoot, 'server', 'api', 'server.js');
const validationJsPath = path.join(repoRoot, 'server', 'api', 'validation.js');

// A stand-in for a real internal exception message. Deliberately shaped
// like something we must NEVER leak (connection string / credential-like
// fragment + stack-trace-ish text) so the test would fail loudly if any
// route ever serializes a raw `error.message`/`.stack` into its response.
const SENSITIVE = 'ECONNREFUSED postgres://zcash_user:s3cr3t-p4ss@10.10.0.9:5432/cipherscan at Pool.query (/root/cipherscan/server/api/db-pool.js:42:11)';

function listJsFilesRecursive(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listJsFilesRecursive(full));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

// Matches a client-response field being set directly from a raw caught
// exception's message/stack, e.g.:
//   error: error.message
//   error: err.message || 'Failed to do X'
//   message: e.stack
// Does NOT match `console.error('...', error.message)` (no `key:` prefix)
// or `if (error.message.includes(...))` (no key/value colon assignment).
const LEAK_PATTERN = /\b(error|message|detail|reason)\s*:\s*(error|err|e)\.(message|stack)\b/;

function staticallyScanForLeaks() {
  const files = [...listJsFilesRecursive(routesDir), serverJsPath, validationJsPath];
  const offenders = [];

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const lines = source.split('\n');
    lines.forEach((line, idx) => {
      if (LEAK_PATTERN.test(line)) {
        offenders.push(`${path.relative(repoRoot, file)}:${idx + 1}: ${line.trim()}`);
      }
    });
  }

  return offenders;
}

test('static scan: no route handler or server.js serializes a raw exception message/stack into a JSON response field', () => {
  const offenders = staticallyScanForLeaks();
  assert.deepEqual(
    offenders,
    [],
    `Found raw exception message/stack leaking into a client-facing response field:\n${offenders.join('\n')}\n` +
      'Replace with a stable, route-specific safe fallback string and keep the raw error in console.error() only.'
  );
});

// ---------------------------------------------------------------------------
// Runtime execution: mount real handlers, force sensitive-looking failures,
// and confirm the response never contains the sensitive text.
// ---------------------------------------------------------------------------

async function startApp(app) {
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

function assertNoLeak(body) {
  const serialized = JSON.stringify(body);
  assert.ok(
    !serialized.includes(SENSITIVE),
    `Response leaked the raw internal exception message: ${serialized}`
  );
}

test('/api/mempool (tx-mempool.js) returns a safe fallback, not the raw RPC exception message', async () => {
  const { injectDependencies } = require('../api/routes/transactions/_helpers');
  const mempoolRouter = require('../api/routes/transactions/tx-mempool');

  const app = express();
  app.locals.callZebraRPC = async () => { throw new Error(SENSITIVE); };
  app.locals.listCache = undefined;
  app.use(injectDependencies);
  app.use(mempoolRouter);

  const { baseUrl, close } = await startApp(app);
  try {
    const response = await fetch(`${baseUrl}/api/mempool`);
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.equal(body.success, false);
    assert.equal(body.error, 'Failed to fetch mempool');
    assertNoLeak(body);
  } finally {
    await close();
  }
});

test('/api/tx/broadcast (tx-write.js) returns a safe fallback, not the raw Zebra RPC rejection message', async () => {
  const { injectDependencies } = require('../api/routes/transactions/_helpers');
  const broadcastRouter = require('../api/routes/transactions/tx-write');

  const app = express();
  app.use(express.json());
  app.locals.callZebraRPC = async () => { throw new Error(SENSITIVE); };
  app.use(injectDependencies);
  app.use(broadcastRouter);

  const { baseUrl, close } = await startApp(app);
  try {
    const response = await fetch(`${baseUrl}/api/tx/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawTx: 'ab'.repeat(20) }),
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.equal(body.error, 'Failed to broadcast transaction');
    assertNoLeak(body);
  } finally {
    await close();
  }
});

test('/api/tx/:txid/linkability (tx-read.js) returns a safe fallback, not the raw analysis exception message', async () => {
  const { injectDependencies } = require('../api/routes/transactions/_helpers');
  const txReadRouter = require('../api/routes/transactions/tx-read');

  const app = express();
  app.locals.findLinkedTransactions = async () => { throw new Error(SENSITIVE); };
  app.use(injectDependencies);
  app.use(txReadRouter);

  const { baseUrl, close } = await startApp(app);
  const txid = 'a'.repeat(64);
  try {
    const response = await fetch(`${baseUrl}/api/tx/${txid}/linkability`);
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.equal(body.success, false);
    assert.equal(body.error, 'Failed to analyze transaction linkability');
    assertNoLeak(body);
  } finally {
    await close();
  }
});

test('/api/privacy/risks (privacy.js) returns a safe fallback, not the raw query exception message', async () => {
  const privacyRouter = require('../api/routes/privacy');

  const app = express();
  app.locals.pool = {};
  app.locals.queryPrivacyLinkageEdges = async () => { throw new Error(SENSITIVE); };
  app.use(privacyRouter);

  const { baseUrl, close } = await startApp(app);
  try {
    const response = await fetch(`${baseUrl}/api/privacy/risks`);
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.equal(body.success, false);
    assert.equal(body.error, 'Failed to fetch privacy risks');
    assertNoLeak(body);
  } finally {
    await close();
  }
});

test('/api/stats/shielded-count (stats.js) returns a safe fallback, not the raw DB exception message', async () => {
  const statsRouter = require('../api/routes/stats');

  const app = express();
  app.locals.pool = {
    query: async () => { throw new Error(SENSITIVE); },
  };
  app.use(statsRouter);

  const { baseUrl, close } = await startApp(app);
  try {
    const response = await fetch(`${baseUrl}/api/stats/shielded-count?since=2024-01-01`);
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.equal(body.success, false);
    assert.equal(body.error, 'Failed to fetch shielded count');
    assertNoLeak(body);
  } finally {
    await close();
  }
});

// Special case: batch endpoints (e.g. /api/tx/raw/batch) must not leak
// internals in a per-item failure, but MUST retain the { txid, success }
// shape so callers can still tell which items failed.
test('/api/tx/raw/batch (tx-raw.js) per-item failures keep the {txid, success} shape without leaking the raw RPC exception', async () => {
  const { injectDependencies } = require('../api/routes/transactions/_helpers');
  const txRawRouter = require('../api/routes/transactions/tx-raw');

  const app = express();
  app.use(express.json());

  const okTxid = 'a'.repeat(64);
  const failTxid = 'b'.repeat(64);

  app.locals.callZebraRPC = async (method, params) => {
    assert.equal(method, 'getrawtransaction');
    const [txid] = params;
    if (txid === failTxid) throw new Error(SENSITIVE);
    return 'deadbeef';
  };
  // Force the lightwalletd fast-path off so every item goes through
  // callZebraRPC (matches production when CompactTxStreamer isn't wired up).
  app.locals.CompactTxStreamer = null;
  app.use(injectDependencies);
  app.use(txRawRouter);

  const { baseUrl, close } = await startApp(app);
  try {
    const response = await fetch(`${baseUrl}/api/tx/raw/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txids: [okTxid, failTxid] }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.total, 2);
    assert.equal(body.successful, 1);

    // Successful item shape preserved.
    assert.deepEqual(body.transactions, [{ txid: okTxid, hex: 'deadbeef' }]);

    // Failed item retains txid/success shape but with a safe, stable
    // message — never the raw exception text.
    assert.equal(body.failed.length, 1);
    assert.deepEqual(body.failed[0], { txid: failTxid, error: 'Failed to fetch transaction', success: false });

    assertNoLeak(body);
  } finally {
    await close();
  }
});
