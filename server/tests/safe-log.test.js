/**
 * Regression suite for `server/api/lib/safe-log.js`.
 *
 * Injects fake errors shaped like the real leaks a Postgres-backed
 * explorer can produce (credential-bearing connection strings, viewing/
 * service/API keys, Zcash addresses, 64-hex txids/hashes, query strings,
 * and raw SQL text) and asserts the captured `console.error`/`console.warn`
 * output never contains any of that sensitive text — while still keeping
 * genuinely useful, non-sensitive context (error class, Postgres `code`/
 * `table`, etc.).
 */

'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  redactText,
  sanitizeError,
  logSafeError,
  logSafeWarn,
} = require('../api/lib/safe-log');

// Representative secrets/identifiers that must NEVER survive redaction.
const SECRETS = {
  pgUrl: 'postgres://zcash_user:s3cr3t-p4ss@10.10.0.9:5432/cipherscan',
  pgPassword: 's3cr3t-p4ss',
  redisUrl: 'redis://:hunter2@127.0.0.1:6379',
  redisPassword: 'hunter2',
  serviceKey: 'synthetic-service-credential-for-redaction-test',
  apiKey: 'synthetic-api-credential-for-redaction-test',
  viewingKey:
    'zxviews1qw6azrhqqqqpqrxsp6vzs8h4ny5tk9zjkxlmkey0000000000000000000000000000000000000000',
  transparentAddress: 't1V3Jw9GsPaGYqPFudpAsF8fH5NkiZeE33Z',
  saplingAddress: 'zs1z7rejlpsa98s2rrrfkwmaxu53e4ue0ulcrw0h4x5g8jl04tak0d3mm47vdtahatqrlkngh9sly',
  txid: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9',
  bearerToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature-part-value',
};

function makeSensitiveError() {
  const err = new Error(
    `ECONNREFUSED ${SECRETS.pgUrl} — QUERY: SELECT * FROM addresses WHERE address = '${SECRETS.transparentAddress}' AND txid = '${SECRETS.txid}'`
  );
  err.name = 'DatabaseError';
  err.code = '08006';
  err.table = 'addresses';
  err.detail = `Key (address)=(${SECRETS.transparentAddress}) already exists.`;
  err.stack = `DatabaseError: ${err.message}\n    at Pool.query (${SECRETS.pgUrl}/db-pool.js:42:11)`;
  return err;
}

function assertNoSecretsLeaked(serialized) {
  for (const [name, value] of Object.entries(SECRETS)) {
    assert.ok(
      !serialized.includes(value),
      `Redacted output leaked secret "${name}": ${value}\nFull output: ${serialized}`
    );
  }
  // Never leak the literal SQL statement shape either, even if some
  // individual token inside it was already caught above.
  assert.ok(!/SELECT[\s\S]*FROM/.test(serialized), `Redacted output leaked raw SQL: ${serialized}`);
}

test('redactText: strips a credential-bearing Postgres URL', () => {
  const out = redactText(`connection failed: ${SECRETS.pgUrl}`);
  assert.ok(!out.includes(SECRETS.pgPassword));
  assert.ok(!out.includes(SECRETS.pgUrl));
  assert.ok(out.includes('postgres://'), 'scheme should be retained for debuggability');
});

test('redactText: strips a credential-bearing Redis URL (empty username)', () => {
  const out = redactText(`redis connect error: ${SECRETS.redisUrl}`);
  assert.ok(!out.includes(SECRETS.redisPassword));
  assert.ok(!out.includes(SECRETS.redisUrl));
});

test('redactText: strips embedded SQL statements (and any literals inside them)', () => {
  const out = redactText(
    `syntax error at or near "$1" — QUERY: SELECT * FROM transactions WHERE txid = '${SECRETS.txid}'`
  );
  assert.ok(!out.includes(SECRETS.txid));
  assert.ok(!/SELECT[\s\S]*FROM/.test(out));
  assert.ok(out.includes('[REDACTED_SQL]'));
});

test('redactText: strips Zcash transparent and shielded addresses', () => {
  const out = redactText(`failed for ${SECRETS.transparentAddress} and ${SECRETS.saplingAddress}`);
  assert.ok(!out.includes(SECRETS.transparentAddress));
  assert.ok(!out.includes(SECRETS.saplingAddress));
});

test('redactText: strips 64-hex txids/block hashes', () => {
  const out = redactText(`lookup failed for txid ${SECRETS.txid}`);
  assert.ok(!out.includes(SECRETS.txid));
});

test('redactText: strips viewing keys', () => {
  const out = redactText(`rejected viewing key ${SECRETS.viewingKey}`);
  assert.ok(!out.includes(SECRETS.viewingKey));
});

test('redactText: strips API/service keys passed as key=value', () => {
  const out = redactText(`request failed: api_key=${SECRETS.apiKey} x-service-key=${SECRETS.serviceKey}`);
  assert.ok(!out.includes(SECRETS.apiKey));
  assert.ok(!out.includes(SECRETS.serviceKey));
});

test('redactText: strips Authorization Bearer tokens', () => {
  const out = redactText(`Authorization: Bearer ${SECRETS.bearerToken} rejected`);
  assert.ok(!out.includes(SECRETS.bearerToken));
});

test('redactText: strips URL query strings', () => {
  const out = redactText(
    `GET https://internal.example.com/lookup?address=${SECRETS.transparentAddress}&api_key=${SECRETS.apiKey} failed`
  );
  assert.ok(!out.includes(SECRETS.transparentAddress));
  assert.ok(!out.includes(SECRETS.apiKey));
});

test('redactText: does not mangle ordinary lowercase prose containing SQL-ish words', () => {
  const benign = 'Please select a network from the list before continuing';
  assert.equal(redactText(benign), benign);
});

test('sanitizeError: retains error class/code/table but redacts message and stack', () => {
  const err = makeSensitiveError();
  const safe = sanitizeError(err);
  const serialized = JSON.stringify(safe);

  assertNoSecretsLeaked(serialized);

  // Useful, non-sensitive context is retained.
  assert.equal(safe.name, 'DatabaseError');
  assert.equal(safe.code, '08006');
  assert.equal(safe.table, 'addresses');

  // Risky pg fields (row-level data) are never forwarded at all.
  assert.equal(safe.detail, undefined);
});

test('sanitizeError: handles non-Error thrown values without crashing', () => {
  const safe = sanitizeError(`raw string throw containing ${SECRETS.transparentAddress}`);
  assert.ok(!JSON.stringify(safe).includes(SECRETS.transparentAddress));
});

test('sanitizeError: handles null/undefined thrown values without crashing', () => {
  assert.doesNotThrow(() => sanitizeError(null));
  assert.doesNotThrow(() => sanitizeError(undefined));
});

test('logSafeError: captured console.error output contains none of the injected secrets', () => {
  const calls = [];
  const originalError = console.error;
  console.error = (...args) => calls.push(args);
  try {
    logSafeError('Error fetching address:', makeSensitiveError());
  } finally {
    console.error = originalError;
  }

  assert.equal(calls.length, 1);
  const serialized = JSON.stringify(calls[0]);
  assertNoSecretsLeaked(serialized);
  // The stable label context is preserved for grep-ability in logs.
  assert.ok(serialized.includes('Error fetching address:'));
});

test('logSafeWarn: captured console.warn output contains none of the injected secrets', () => {
  const calls = [];
  const originalWarn = console.warn;
  console.warn = (...args) => calls.push(args);
  try {
    logSafeWarn('[MIGRATION] pool lookup failed:', makeSensitiveError());
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(calls.length, 1);
  const serialized = JSON.stringify(calls[0]);
  assertNoSecretsLeaked(serialized);
});

test('logSafeError: redacts string context values passed alongside the error', () => {
  const calls = [];
  const originalError = console.error;
  console.error = (...args) => calls.push(args);
  try {
    logSafeError('Bridge lookup error:', makeSensitiveError(), {
      route: `/api/address/${SECRETS.transparentAddress}`,
    });
  } finally {
    console.error = originalError;
  }

  const serialized = JSON.stringify(calls[0]);
  assertNoSecretsLeaked(serialized);
});

test('logSafeError: does not throw when error is undefined (defensive callers)', () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.doesNotThrow(() => logSafeError('Something failed:', undefined));
  } finally {
    console.error = originalError;
  }
});
