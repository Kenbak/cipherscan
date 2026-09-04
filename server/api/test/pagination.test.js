const assert = require('node:assert/strict');
const test = require('node:test');

const {
  DEFAULT_MAX_OFFSET,
  parseSafeLimit,
  parseSafeOffset,
  parseSafeListPagination,
  parseSafePagePagination,
  offsetExceededError,
} = require('../lib/pagination');

// ─── parseSafeLimit ──────────────────────────────────────────────────────────

test('parseSafeLimit: falls back to defaultLimit for missing/invalid values', () => {
  assert.equal(parseSafeLimit(undefined, { defaultLimit: 20, maxLimit: 100 }), 20);
  assert.equal(parseSafeLimit('not-a-number', { defaultLimit: 20, maxLimit: 100 }), 20);
  assert.equal(parseSafeLimit('0', { defaultLimit: 20, maxLimit: 100 }), 20);
  assert.equal(parseSafeLimit('-5', { defaultLimit: 20, maxLimit: 100 }), 20);
  assert.equal(parseSafeLimit('', { defaultLimit: 20, maxLimit: 100 }), 20);
});

test('parseSafeLimit: passes through normal in-range values unchanged', () => {
  assert.equal(parseSafeLimit('1', { defaultLimit: 20, maxLimit: 100 }), 1);
  assert.equal(parseSafeLimit('50', { defaultLimit: 20, maxLimit: 100 }), 50);
  assert.equal(parseSafeLimit('100', { defaultLimit: 20, maxLimit: 100 }), 100);
});

test('parseSafeLimit: clamps values above maxLimit', () => {
  assert.equal(parseSafeLimit('99999', { defaultLimit: 20, maxLimit: 100 }), 100);
  assert.equal(parseSafeLimit('101', { defaultLimit: 20, maxLimit: 100 }), 100);
});

test('parseSafeLimit: uses module defaults when opts omitted', () => {
  assert.equal(parseSafeLimit(undefined), 20);
  assert.equal(parseSafeLimit('500'), 100);
});

// ─── parseSafeOffset ─────────────────────────────────────────────────────────

test('parseSafeOffset: normal small offsets pass through untouched', () => {
  for (const raw of ['0', '1', '20', '5000', undefined, 'garbage', '-10']) {
    const result = parseSafeOffset(raw, { maxOffset: 100_000 });
    assert.equal(result.offsetExceeded, false, `expected ${raw} not to exceed the cap`);
  }
  assert.deepEqual(parseSafeOffset('5000', { maxOffset: 100_000 }), {
    offset: 5000,
    requestedOffset: 5000,
    offsetExceeded: false,
    maxOffset: 100_000,
  });
});

test('parseSafeOffset: non-numeric or negative input safely resolves to 0', () => {
  assert.equal(parseSafeOffset('garbage').offset, 0);
  assert.equal(parseSafeOffset(undefined).offset, 0);
  assert.equal(parseSafeOffset('-100').offset, 0);
  assert.equal(parseSafeOffset('NaN').offset, 0);
});

test('parseSafeOffset: caps the query offset at maxOffset but reports what was requested', () => {
  const result = parseSafeOffset('9999999999', { maxOffset: 100_000 });
  assert.equal(result.offset, 100_000);
  assert.equal(result.requestedOffset, 9_999_999_999);
  assert.equal(result.offsetExceeded, true);
  assert.equal(result.maxOffset, 100_000);
});

test('parseSafeOffset: exactly at the cap is not "exceeded"', () => {
  const result = parseSafeOffset('100000', { maxOffset: 100_000 });
  assert.equal(result.offset, 100_000);
  assert.equal(result.offsetExceeded, false);
});

test('parseSafeOffset: one past the cap is exceeded', () => {
  const result = parseSafeOffset('100001', { maxOffset: 100_000 });
  assert.equal(result.offset, 100_000);
  assert.equal(result.offsetExceeded, true);
});

test('parseSafeOffset: falls back to the shared DEFAULT_MAX_OFFSET when unspecified', () => {
  const result = parseSafeOffset(String(DEFAULT_MAX_OFFSET + 1));
  assert.equal(result.offsetExceeded, true);
  assert.equal(result.maxOffset, DEFAULT_MAX_OFFSET);
});

// ─── parseSafeListPagination ────────────────────────────────────────────────

test('parseSafeListPagination: normal request shape is preserved (limit/offset only, no exceeded flag tripped)', () => {
  const result = parseSafeListPagination(
    { limit: '25', offset: '50' },
    { defaultLimit: 20, maxLimit: 100, maxOffset: 100_000 },
  );
  assert.equal(result.limit, 25);
  assert.equal(result.offset, 50);
  assert.equal(result.requestedOffset, 50);
  assert.equal(result.offsetExceeded, false);
});

test('parseSafeListPagination: applies independent defaults for limit and offset', () => {
  const result = parseSafeListPagination({}, { defaultLimit: 20, maxLimit: 100, maxOffset: 100_000 });
  assert.equal(result.limit, 20);
  assert.equal(result.offset, 0);
  assert.equal(result.offsetExceeded, false);
});

test('parseSafeListPagination: deep offset is capped and flagged, limit still respected', () => {
  const result = parseSafeListPagination(
    { limit: '10', offset: '5000000' },
    { defaultLimit: 20, maxLimit: 100, maxOffset: 100_000 },
  );
  assert.equal(result.limit, 10);
  assert.equal(result.offset, 100_000);
  assert.equal(result.requestedOffset, 5_000_000);
  assert.equal(result.offsetExceeded, true);
});

// ─── parseSafePagePagination ────────────────────────────────────────────────

test('parseSafePagePagination: page 1 maps to offset 0', () => {
  const result = parseSafePagePagination({ page: '1', limit: '25' }, { maxOffset: 100_000 });
  assert.equal(result.limit, 25);
  assert.equal(result.page, 1);
  assert.equal(result.offset, 0);
  assert.equal(result.offsetExceeded, false);
});

test('parseSafePagePagination: converts page N to the matching offset', () => {
  const result = parseSafePagePagination({ page: '5', limit: '25' }, { maxOffset: 100_000 });
  assert.equal(result.offset, 100); // (5 - 1) * 25
  assert.equal(result.page, 5);
  assert.equal(result.offsetExceeded, false);
});

test('parseSafePagePagination: invalid/missing page falls back to page 1', () => {
  for (const raw of [undefined, '0', '-3', 'nope']) {
    const result = parseSafePagePagination({ page: raw, limit: '25' }, { maxOffset: 100_000 });
    assert.equal(result.page, 1);
    assert.equal(result.offset, 0);
  }
});

test('parseSafePagePagination: a very deep page is capped and the derived page number reflects the cap', () => {
  const result = parseSafePagePagination(
    { page: '99999999', limit: '25' },
    { maxOffset: 1000 },
  );
  assert.equal(result.offset, 1000);
  assert.equal(result.offsetExceeded, true);
  assert.equal(result.requestedOffset, (99_999_999 - 1) * 25);
  // page is derived from the capped offset, not the requested one
  assert.equal(result.page, Math.floor(1000 / 25) + 1);
});

// ─── offsetExceededError ────────────────────────────────────────────────────

test('offsetExceededError: builds a stable message without a cursor hint', () => {
  const payload = offsetExceededError({ requestedOffset: 250_000, maxOffset: 100_000 });
  assert.equal(payload.maxOffset, 100_000);
  assert.equal(payload.requestedOffset, 250_000);
  assert.match(payload.error, /offset 250000 exceeds the maximum supported offset of 100000/);
});

test('offsetExceededError: appends the cursor hint when provided', () => {
  const payload = offsetExceededError({
    requestedOffset: 250_000,
    maxOffset: 100_000,
    cursorHint: 'Use /api/blocks/list with a cursor instead.',
  });
  assert.match(payload.error, /Use \/api\/blocks\/list with a cursor instead\.$/);
});

// ─── Regression guard: normal-request response shape stability ─────────────
// The whole point of "safe cap" is that ordinary requests (the vast majority
// of real traffic) are byte-for-byte identical to the pre-cap behavior. This
// locks that in explicitly so a future change to the cap logic can't silently
// start mutating small, everyday offsets.

test('regression: a realistic page of requests never trips offsetExceeded', () => {
  const realisticOffsets = ['0', '10', '20', '50', '100', '500', '1000', '10000'];
  for (const offset of realisticOffsets) {
    const result = parseSafeListPagination({ limit: '20', offset }, { maxOffset: 100_000 });
    assert.equal(result.offsetExceeded, false, `offset=${offset} should not be flagged`);
    assert.equal(result.offset, Number(offset));
  }
});
