/**
 * Unit tests for the small contract-layer libraries: zatoshi, cursor, problem, envelope.
 *
 * Run: node --test server/api/test/v1/lib.test.js
 */

const assert = require('node:assert/strict');
const test = require('node:test');

const { toZatoshiString, isZatoshiLike, zatoshiToZecString, applyZatoshiFields } = require('../../v1/lib/zatoshi');
const { encodeCursor, decodeCursor, buildPageMeta } = require('../../v1/lib/cursor');
const { buildProblem, PROBLEM_TYPES } = require('../../v1/lib/problem');

// ---------------------------------------------------------------------------
// zatoshi.js
// ---------------------------------------------------------------------------

test('toZatoshiString: accepts safe integer numbers, integer strings, and bigints', () => {
  assert.equal(toZatoshiString(100000000), '100000000');
  assert.equal(toZatoshiString('100000000'), '100000000');
  assert.equal(toZatoshiString(100000000n), '100000000');
  assert.equal(toZatoshiString(0), '0');
  assert.equal(toZatoshiString('-500'), '-500');
});

test('toZatoshiString: normalizes leading zeros without corrupting sign/value', () => {
  assert.equal(toZatoshiString('007'), '7');
  assert.equal(toZatoshiString('-007'), '-7');
  assert.equal(toZatoshiString('0'), '0');
});

test('toZatoshiString: null/undefined pass through as null', () => {
  assert.equal(toZatoshiString(null), null);
  assert.equal(toZatoshiString(undefined), null);
});

test('toZatoshiString: fails closed on floats — never silently truncates', () => {
  assert.throws(() => toZatoshiString(1.5), TypeError);
  assert.throws(() => toZatoshiString('1.5'), TypeError);
  assert.throws(() => toZatoshiString('1e8'), TypeError);
});

test('toZatoshiString: fails closed on unsafe integers and garbage strings', () => {
  assert.throws(() => toZatoshiString(Number.MAX_SAFE_INTEGER + 10), TypeError);
  assert.throws(() => toZatoshiString('not-a-number'), TypeError);
  assert.throws(() => toZatoshiString('12abc'), TypeError);
  assert.throws(() => toZatoshiString({}), TypeError);
});

test('isZatoshiLike: true/false without throwing', () => {
  assert.equal(isZatoshiLike('12345'), true);
  assert.equal(isZatoshiLike('12.345'), false);
  assert.equal(isZatoshiLike('nope'), false);
});

test('zatoshiToZecString: converts whole and fractional amounts, strips trailing zeros', () => {
  assert.equal(zatoshiToZecString('100000000'), '1');
  assert.equal(zatoshiToZecString('150000000'), '1.5');
  assert.equal(zatoshiToZecString('1'), '0.00000001');
  assert.equal(zatoshiToZecString('0'), '0');
  assert.equal(zatoshiToZecString('-100000000'), '-1');
});

test('applyZatoshiFields: converts targeted fields in place on a cloned object', () => {
  const input = { fee: '5000', size: 250, nested: { value: '100000000' } };
  const { value, warnings } = applyZatoshiFields(input, ['fee', 'nested.value']);
  assert.equal(value.fee, '5000');
  assert.equal(value.nested.value, '100000000');
  assert.equal(value.size, 250); // untouched
  assert.equal(warnings.length, 0);
  // Original object is not mutated.
  assert.equal(input.fee, '5000');
});

test('applyZatoshiFields: collects a warning instead of throwing on a bad field, and leaves it untouched', () => {
  const input = { fee: '1.5' };
  const { value, warnings } = applyZatoshiFields(input, ['fee']);
  assert.equal(value.fee, '1.5'); // left as-is
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].field, 'fee');
});

test('applyZatoshiFields: supports array wildcard paths', () => {
  const input = { items: [{ fee: '100' }, { fee: '200' }] };
  const { value, warnings } = applyZatoshiFields(input, ['items.*.fee']);
  assert.deepEqual(value.items.map((i) => i.fee), ['100', '200']);
  assert.equal(warnings.length, 0);
});

// ---------------------------------------------------------------------------
// cursor.js
// ---------------------------------------------------------------------------

test('encodeCursor/decodeCursor: round-trips a payload', () => {
  const cursor = encodeCursor({ cursor: 123, direction: 'next' });
  assert.equal(typeof cursor, 'string');
  const decoded = decodeCursor(cursor);
  assert.equal(decoded.cursor, 123);
  assert.equal(decoded.direction, 'next');
  assert.equal(decoded.v, 1);
});

test('decodeCursor: returns null (never throws) on malformed input', () => {
  assert.equal(decodeCursor(''), null);
  assert.equal(decodeCursor('not-base64url-json'), null);
  assert.equal(decodeCursor(null), null);
  assert.equal(decodeCursor(undefined), null);
  assert.equal(decodeCursor('a'.repeat(5000)), null);
  assert.equal(decodeCursor(Buffer.from(JSON.stringify({ v: 99 })).toString('base64url')), null);
});

test('buildPageMeta: hasNext/hasPrev false yields null cursors, never a broken encoded cursor', () => {
  const page = buildPageMeta({ limit: 50, hasNext: false, hasPrev: false });
  assert.equal(page.nextCursor, null);
  assert.equal(page.prevCursor, null);
  assert.equal(page.limit, 50);
});

test('buildPageMeta: hasNext true encodes the mapped legacy cursor', () => {
  const page = buildPageMeta({
    limit: 50,
    hasNext: true,
    hasPrev: false,
    nextLegacyCursor: { cursor: 42, direction: 'next' },
    mapLegacyCursor: (p) => p,
  });
  assert.ok(page.nextCursor);
  const decoded = decodeCursor(page.nextCursor);
  assert.equal(decoded.cursor, 42);
  assert.equal(decoded.direction, 'next');
});

// ---------------------------------------------------------------------------
// problem.js
// ---------------------------------------------------------------------------

test('buildProblem: uses the registered default title/status for a known type', () => {
  const doc = buildProblem('not-found', { instance: '/v1/blocks/999999999' });
  assert.equal(doc.status, PROBLEM_TYPES['not-found'].status);
  assert.equal(doc.title, PROBLEM_TYPES['not-found'].title);
  assert.equal(doc.instance, '/v1/blocks/999999999');
  assert.match(doc.type, /\/not-found$/);
});

test('buildProblem: includes field-level errors when provided', () => {
  const doc = buildProblem('validation-error', {
    detail: 'bad input',
    errors: [{ field: 'limit', issue: 'must be <= 100' }],
  });
  assert.equal(doc.errors.length, 1);
  assert.equal(doc.errors[0].field, 'limit');
});

test('buildProblem: falls back to internal-error for an unregistered type slug', () => {
  const doc = buildProblem('totally-made-up-slug');
  assert.equal(doc.status, 500);
});
