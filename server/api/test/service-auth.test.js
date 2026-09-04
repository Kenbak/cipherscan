const assert = require('node:assert/strict');
const test = require('node:test');

const { constantTimeEqual, isKnownServiceKey, createServiceKeyOnlySkip } = require('../service-auth');

test('constantTimeEqual matches equal strings and rejects mismatches/non-strings', () => {
  assert.equal(constantTimeEqual('secret-key', 'secret-key'), true);
  assert.equal(constantTimeEqual('secret-key', 'different-key'), false);
  assert.equal(constantTimeEqual('short', 'a-much-longer-value'), false);
  assert.equal(constantTimeEqual('', ''), true);
  assert.equal(constantTimeEqual(null, 'secret-key'), false);
  assert.equal(constantTimeEqual(undefined, undefined), false);
  assert.equal(constantTimeEqual(42, 42), false);
});

test('isKnownServiceKey matches any configured key and fails closed on empty input', () => {
  const keys = ['key-one', 'key-two', 'key-three'];
  assert.equal(isKnownServiceKey('key-two', keys), true);
  assert.equal(isKnownServiceKey('key-four', keys), false);
  assert.equal(isKnownServiceKey('', keys), false);
  assert.equal(isKnownServiceKey(null, keys), false);
  assert.equal(isKnownServiceKey(undefined, keys), false);
  assert.equal(isKnownServiceKey('key-one', []), false);
});

test('createServiceKeyOnlySkip bypasses the rate limit ONLY for a valid X-Service-Key', () => {
  const skip = createServiceKeyOnlySkip(['real-service-key']);

  // Valid key bypasses regardless of headers/case.
  assert.equal(skip({ headers: { 'x-service-key': 'real-service-key' } }), true);

  // No spoofable Origin/Referer bypass remains — the exact P0 regression
  // this test guards against. A request with no service key, but headers
  // matching our own frontend's Origin/Referer, must NOT bypass the limit.
  assert.equal(skip({
    headers: {
      origin: 'https://cipherscan.app',
      referer: 'https://cipherscan.app/blocks',
    },
  }), false);
  assert.equal(skip({
    headers: { referer: 'https://cipherscan.app/' },
  }), false);

  // A forged/incorrect service key must not bypass either.
  assert.equal(skip({
    headers: {
      'x-service-key': 'guessed-key',
      origin: 'https://cipherscan.app',
    },
  }), false);

  // No headers at all.
  assert.equal(skip({ headers: {} }), false);
});
