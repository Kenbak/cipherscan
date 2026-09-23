const test = require('node:test');
const assert = require('node:assert/strict');
const { estimate, historyPoints, formatHashrate } = require('../api/lib/hashrate');
const DAY = 86400;

test('work is divided by the full elapsed window without rounding or latest-difficulty substitution', () => {
  const result = estimate({ work: '9007199254740993', count: 100, valid: 100, start: DAY, end: DAY * 2, historyStart: 0 });
  assert.equal(result.hashrate, Number('9007199254740993') / DAY);
  assert.equal(result.expectedWork, '9007199254740993');
  assert.equal(result.windowSeconds, DAY);
  assert.equal(result.method, 'target-work-v1');
});

test('missing targets, sparse windows and incomplete history stay unavailable', () => {
  const base = { work: '100', count: 2, valid: 2, start: DAY, end: DAY * 2, historyStart: 0 };
  for (const [patch, reason] of [[{ valid: 1 }, 'missing-targets'], [{ count: 1 }, 'insufficient-blocks'], [{ historyStart: DAY + 1 }, 'incomplete-history'], [{ historyStart: null }, 'incomplete-history']]) {
    const result = estimate({ ...base, ...patch });
    assert.equal(result.hashrate, null); assert.equal(result.unavailableReason, reason);
    assert.equal(formatHashrate(result.hashrate), 'Unavailable');
  }
});

test('seven-day history sums work rather than averaging rounded daily rates, with no partial start', () => {
  const rows = Array.from({ length: 8 }, (_, i) => ({ day_start: i * DAY, expected_work: String((i + 1) * 100), block_count: 2, valid_count: 2 }));
  const points = historyPoints(rows, { start: DAY * 7, end: DAY * 8, historyStart: 0, windowSeconds: DAY * 7 });
  assert.equal(points[0].expectedWork, '2800');
  assert.equal(points[1].expectedWork, '3500');
  assert.equal(points[0].blockCount, 14);
  assert.equal(points[0].hashrate, 2800 / (7 * DAY));
  rows[3].valid_count = 1;
  assert.equal(historyPoints(rows, { start: DAY * 7, end: DAY * 7, historyStart: 0, windowSeconds: DAY * 7 })[0].hashrate, null);
});
