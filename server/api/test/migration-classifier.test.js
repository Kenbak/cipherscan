'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  classifyMigration,
  classifyDenomSeries,
  FAMILIES,
} = require('../lib/migration-classifier');

// ─── Denomination Series Classification ──────────────────────────────────────

test('classifyDenomSeries — ZIP-318 {1,2,5}x10^k', () => {
  assert.equal(classifyDenomSeries(0.01), 'zip318');
  assert.equal(classifyDenomSeries(0.02), 'zip318');
  assert.equal(classifyDenomSeries(0.05), 'zip318');
  assert.equal(classifyDenomSeries(0.1), 'zip318');
  assert.equal(classifyDenomSeries(0.2), 'zip318');
  assert.equal(classifyDenomSeries(0.5), 'zip318');
  assert.equal(classifyDenomSeries(1), 'zip318');
  assert.equal(classifyDenomSeries(2), 'zip318');
  assert.equal(classifyDenomSeries(5), 'zip318');
  assert.equal(classifyDenomSeries(10), 'zip318');
  assert.equal(classifyDenomSeries(100), 'zip318');
  assert.equal(classifyDenomSeries(10000), 'zip318');
});

test('classifyDenomSeries — power-of-10 (not in zip318 set)', () => {
  assert.equal(classifyDenomSeries(0.001), 'power-of-10');
});

test('classifyDenomSeries — non-standard amounts', () => {
  assert.equal(classifyDenomSeries(3.7), 'non-standard');
  assert.equal(classifyDenomSeries(0.123), 'non-standard');
  assert.equal(classifyDenomSeries(7.5), 'non-standard');
  assert.equal(classifyDenomSeries(0.0001), 'non-standard');
  assert.equal(classifyDenomSeries(42.42), 'non-standard');
});

// ─── ZIP-318 Current SDK Classification ──────────────────────────────────────

test('classifyMigration — zip318-current-sdk (5/5 signals)', () => {
  const result = classifyMigration({
    ironwoodActions: 1,
    orchardActions: 2,
    fee: 15000,
    expiryDelta: 65000,
    anchorOnGrid: true,
    amountZec: 1.0,
    locktime: 0,
  });

  assert.equal(result.family, 'zip318-current-sdk');
  assert.equal(result.confidence, 'high');
  assert.equal(result.signals.ironwoodActions.match, true);
  assert.equal(result.signals.fee.match, true);
  assert.equal(result.signals.expiryDelta.match, true);
  assert.equal(result.signals.anchorOnGrid.match, true);
  assert.equal(result.signals.denomSeries.match, true);
});

test('classifyMigration — zip318-current-sdk with 50k expiry', () => {
  const result = classifyMigration({
    ironwoodActions: 1,
    orchardActions: 2,
    fee: 15000,
    expiryDelta: 52000,
    anchorOnGrid: true,
    amountZec: 0.2,
    locktime: 0,
  });

  assert.equal(result.family, 'zip318-current-sdk');
  assert.equal(result.confidence, 'high');
});

test('classifyMigration — zip318-current-sdk with various denominations', () => {
  for (const amount of [0.01, 0.02, 0.05, 0.1, 0.5, 2, 5, 10, 100, 10000]) {
    const result = classifyMigration({
      ironwoodActions: 1,
      orchardActions: 2,
      fee: 15000,
      expiryDelta: 60000,
      anchorOnGrid: true,
      amountZec: amount,
      locktime: 0,
    });
    assert.equal(result.family, 'zip318-current-sdk', `Failed for amount ${amount}`);
    assert.equal(result.confidence, 'high', `Failed confidence for amount ${amount}`);
  }
});

// ─── Cake/zkool2 Compatible Classification ───────────────────────────────────

test('classifyMigration — cake-zkool2-compatible (5/5 signals)', () => {
  const result = classifyMigration({
    ironwoodActions: 2,
    orchardActions: 2,
    fee: 20000,
    expiryDelta: 38,
    anchorOnGrid: false,
    amountZec: 0.01,
    locktime: 0,
  });

  assert.equal(result.family, 'cake-zkool2-compatible');
  assert.equal(result.confidence, 'high');
  assert.equal(result.signals.ironwoodActions.match, true);
  assert.equal(result.signals.fee.match, true);
  assert.equal(result.signals.expiryDelta.match, true);
  assert.equal(result.signals.anchorOnGrid.match, true);
  assert.equal(result.signals.denomSeries.match, true);
});

test('classifyMigration — cake-zkool2-compatible with 0.001 ZEC', () => {
  const result = classifyMigration({
    ironwoodActions: 2,
    orchardActions: 2,
    fee: 20000,
    expiryDelta: 40,
    anchorOnGrid: false,
    amountZec: 0.001,
    locktime: 0,
  });

  assert.equal(result.family, 'cake-zkool2-compatible');
  assert.equal(result.confidence, 'high');
});

test('classifyMigration — cake-zkool2-compatible with confirmation delay', () => {
  // Confirmation delay reduces the observed expiry delta below 40
  for (const delta of [36, 37, 38, 39, 40]) {
    const result = classifyMigration({
      ironwoodActions: 2,
      orchardActions: 2,
      fee: 20000,
      expiryDelta: delta,
      anchorOnGrid: false,
      amountZec: 0.1,
      locktime: 0,
    });
    assert.equal(result.family, 'cake-zkool2-compatible', `Failed for delta ${delta}`);
  }
});

// ─── Multi-action Classification ─────────────────────────────────────────────

test('classifyMigration — multi-action (orchardActions > 2)', () => {
  const result = classifyMigration({
    ironwoodActions: 2,
    orchardActions: 5,
    fee: 35000,
    expiryDelta: 38,
    anchorOnGrid: false,
    amountZec: 10,
    locktime: 0,
  });

  assert.equal(result.family, 'multi-action-migration');
  assert.equal(result.confidence, 'medium');
});

test('classifyMigration — multi-action note prep (15 actions)', () => {
  const result = classifyMigration({
    ironwoodActions: 2,
    orchardActions: 15,
    fee: 85000,
    expiryDelta: 38,
    anchorOnGrid: false,
    amountZec: 100,
    locktime: 0,
  });

  assert.equal(result.family, 'multi-action-migration');
  assert.equal(result.confidence, 'medium');
});

// ─── Ambiguous / Conflicting Signals ─────────────────────────────────────────

test('classifyMigration — ambiguous (mixed signals, low confidence)', () => {
  // I:1 (zip318) but non-grid anchor and +40 expiry (cake)
  const result = classifyMigration({
    ironwoodActions: 1,
    orchardActions: 2,
    fee: 15000,
    expiryDelta: 38,
    anchorOnGrid: false,
    amountZec: 0.1,
    locktime: 0,
  });

  // Should still classify but with lower confidence
  assert.notEqual(result.confidence, 'high');
});

test('classifyMigration — conflicting signals resolve to best match', () => {
  // I:2 (cake) but grid anchor (zip318) — 4 signals match cake, 1 matches zip318
  const result = classifyMigration({
    ironwoodActions: 2,
    orchardActions: 2,
    fee: 20000,
    expiryDelta: 38,
    anchorOnGrid: true,
    amountZec: 0.01,
    locktime: 0,
  });

  assert.equal(result.family, 'cake-zkool2-compatible');
  assert.equal(result.confidence, 'medium');
  assert.equal(result.signals.anchorOnGrid.match, false);
});

test('classifyMigration — unknown when too few signals match', () => {
  // Non-standard amount, weird fee, no expiry
  const result = classifyMigration({
    ironwoodActions: 2,
    orchardActions: 2,
    fee: 99999,
    expiryDelta: null,
    anchorOnGrid: false,
    amountZec: 3.7,
    locktime: 0,
  });

  // With only anchorOnGrid matching cake and denom being non-standard,
  // it might still classify or go unknown depending on score
  assert.ok(['cake-zkool2-compatible', 'unknown'].includes(result.family));
  assert.notEqual(result.confidence, 'high');
});

test('classifyMigration — no crash with null/zero values', () => {
  const result = classifyMigration({
    ironwoodActions: 0,
    orchardActions: 0,
    fee: 0,
    expiryDelta: null,
    anchorOnGrid: false,
    amountZec: 0,
    locktime: 0,
  });

  assert.ok(result.family);
  assert.ok(result.confidence);
  assert.ok(result.signals);
});

// ─── Label / Structure Verification ──────────────────────────────────────────

test('classifyMigration — result has required fields', () => {
  const result = classifyMigration({
    ironwoodActions: 1,
    orchardActions: 2,
    fee: 15000,
    expiryDelta: 65000,
    anchorOnGrid: true,
    amountZec: 1,
    locktime: 0,
  });

  assert.ok(typeof result.family === 'string');
  assert.ok(['high', 'medium', 'low'].includes(result.confidence));
  assert.ok(typeof result.label === 'string');
  assert.ok(typeof result.shortLabel === 'string');
  assert.ok(typeof result.signals === 'object');
  assert.ok(result.signals.ironwoodActions);
  assert.ok(result.signals.fee);
  assert.ok(result.signals.expiryDelta);
  assert.ok(result.signals.anchorOnGrid);
  assert.ok(result.signals.denomSeries);
});

test('classifyMigration — labels use "compatible with" language', () => {
  const zip318 = classifyMigration({
    ironwoodActions: 1, orchardActions: 2, fee: 15000,
    expiryDelta: 65000, anchorOnGrid: true, amountZec: 1, locktime: 0,
  });
  assert.ok(zip318.label.includes('Compatible'));

  const cake = classifyMigration({
    ironwoodActions: 2, orchardActions: 2, fee: 20000,
    expiryDelta: 38, anchorOnGrid: false, amountZec: 0.01, locktime: 0,
  });
  assert.ok(cake.label.includes('Compatible'));
});

test('FAMILIES constants are well-formed', () => {
  for (const [key, family] of Object.entries(FAMILIES)) {
    assert.ok(typeof family.id === 'string', `${key} missing id`);
    assert.ok(typeof family.label === 'string', `${key} missing label`);
    assert.ok(typeof family.shortLabel === 'string', `${key} missing shortLabel`);
  }
});
