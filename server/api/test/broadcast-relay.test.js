const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createInstanceId,
  wrapEnvelope,
  parseEnvelope,
  createSeenMessageTracker,
  receiveEnvelope,
} = require('../broadcast-relay');

test('createInstanceId returns distinct, non-empty IDs', () => {
  const a = createInstanceId();
  const b = createInstanceId();
  assert.equal(typeof a, 'string');
  assert.ok(a.length > 0);
  assert.notEqual(a, b);
});

test('wrapEnvelope/parseEnvelope round-trip the body and reject malformed payloads', () => {
  const instanceId = createInstanceId();
  const body = { type: 'new_block', data: { height: 100 } };
  const raw = wrapEnvelope(instanceId, body);

  const parsed = parseEnvelope(raw);
  assert.equal(parsed.instanceId, instanceId);
  assert.equal(typeof parsed.msgId, 'string');
  assert.ok(parsed.msgId.length > 0);
  assert.deepEqual(parsed.body, body);

  assert.equal(parseEnvelope('not-json'), null);
  assert.equal(parseEnvelope('null'), null);
  assert.equal(parseEnvelope('"just a string"'), null);
  assert.equal(parseEnvelope(JSON.stringify({ instanceId: 'a' })), null, 'missing msgId/body');
  assert.equal(parseEnvelope(JSON.stringify({ msgId: 'b', body: {} })), null, 'missing instanceId');
  assert.equal(parseEnvelope(JSON.stringify({ instanceId: '', msgId: 'b', body: {} })), null, 'empty instanceId');
});

test('createSeenMessageTracker evicts the oldest entry once the cap is reached', () => {
  const tracker = createSeenMessageTracker(2);
  assert.equal(tracker.hasSeen('a'), false);

  tracker.markSeen('a');
  tracker.markSeen('b');
  assert.equal(tracker.size(), 2);
  assert.equal(tracker.hasSeen('a'), true);
  assert.equal(tracker.hasSeen('b'), true);

  tracker.markSeen('c'); // evicts 'a' (oldest)
  assert.equal(tracker.size(), 2);
  assert.equal(tracker.hasSeen('a'), false);
  assert.equal(tracker.hasSeen('b'), true);
  assert.equal(tracker.hasSeen('c'), true);

  // Re-marking an already-seen ID is a no-op, not an eviction trigger.
  tracker.markSeen('b');
  assert.equal(tracker.size(), 2);
  assert.equal(tracker.hasSeen('c'), true);
});

test('createSeenMessageTracker rejects a non-positive-integer cap', () => {
  assert.throws(() => createSeenMessageTracker(0), RangeError);
  assert.throws(() => createSeenMessageTracker(-1), RangeError);
  assert.throws(() => createSeenMessageTracker(1.5), RangeError);
});

test('receiveEnvelope drops self-echoed broadcasts (the core P0 fix)', () => {
  const ownInstanceId = createInstanceId();
  const tracker = createSeenMessageTracker();
  const raw = wrapEnvelope(ownInstanceId, { type: 'new_block', data: { height: 1 } });

  const result = receiveEnvelope({ raw, ownInstanceId, tracker });
  assert.equal(result, null, 'a message published by this instance must never be redelivered to it');
});

test('receiveEnvelope delivers messages from other instances exactly once', () => {
  const ownInstanceId = createInstanceId();
  const otherInstanceId = createInstanceId();
  const tracker = createSeenMessageTracker();
  const body = { type: 'mempool_tx', data: { txid: 'a'.repeat(64) } };
  const raw = wrapEnvelope(otherInstanceId, body);

  const first = receiveEnvelope({ raw, ownInstanceId, tracker });
  assert.deepEqual(first, body);

  // A duplicate delivery of the exact same message (e.g. Redis at-least-
  // once redelivery) must not be delivered twice.
  const second = receiveEnvelope({ raw, ownInstanceId, tracker });
  assert.equal(second, null);
});

test('receiveEnvelope drops malformed messages without throwing', () => {
  const tracker = createSeenMessageTracker();
  assert.equal(receiveEnvelope({ raw: 'garbage', ownInstanceId: 'x', tracker }), null);
  assert.equal(receiveEnvelope({ raw: '{}', ownInstanceId: 'x', tracker }), null);
});

test('service-only fields (e.g. raw_hex) are never part of the wrapped envelope', () => {
  // wrapEnvelope only ever receives the regular/public message in
  // production (server.js publishes `message`, never `serviceExtra`) — this
  // asserts the contract at the module boundary: whatever is passed as
  // `body` is exactly what round-trips, with no implicit merging of any
  // second payload.
  const instanceId = createInstanceId();
  const publicBody = { type: 'mempool_tx', data: { txid: 'b'.repeat(64), size: 226 } };
  const raw = wrapEnvelope(instanceId, publicBody);
  const parsed = parseEnvelope(raw);
  assert.deepEqual(Object.keys(parsed.body.data).sort(), ['size', 'txid']);
  assert.equal('raw_hex' in parsed.body.data, false);
});
