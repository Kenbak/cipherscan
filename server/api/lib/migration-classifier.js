'use strict';

/**
 * Migration Wallet Fingerprint Classifier (v1)
 *
 * Identifies transaction-construction families based on 5 on-chain signals.
 * Attribution uses "compatible with" language — never definitive authorship.
 * No user-level clustering or ownership claims.
 *
 * Signals: ironwood action count, fee, expiry delta, anchor grid alignment,
 * denomination series.
 */

// ─── Family Definitions ──────────────────────────────────────────────────────

const FAMILIES = {
  ZIP318_CURRENT_SDK: {
    id: 'zip318-current-sdk',
    label: 'Compatible with ZODL, Vizor, and current librustzcash SDK wallets',
    shortLabel: 'ZODL / Vizor',
    expected: {
      ironwoodActions: 1,
      fee: 15000,
      expiryDelta: { type: 'bucketed', min: 30000, max: 70000 },
      anchorOnGrid: true,
      denomSeries: 'zip318',
    },
  },
  CAKE_ZKOOL2: {
    id: 'cake-zkool2-compatible',
    label: 'Compatible with Cake Wallet v6.4.0+ (zkool2 backend, pre-unpadding SDK)',
    shortLabel: 'Cake/zkool2',
    expected: {
      ironwoodActions: 2,
      fee: 20000,
      expiryDelta: { type: 'legacy', min: 3, max: 40 },
      anchorOnGrid: false,
      denomSeries: 'power-of-10',
    },
  },
  MULTI_ACTION: {
    id: 'multi-action-migration',
    label: 'Multi-note migration (note preparation or consolidation)',
    shortLabel: 'Multi-action',
    expected: null,
  },
  UNKNOWN: {
    id: 'unknown',
    label: 'Unclassified migration transaction',
    shortLabel: 'Unknown',
    expected: null,
  },
};

// ZIP-318 canonical denominations: {1, 2, 5} × 10^k, min 0.01
const ZIP318_DENOMS = [];
for (let k = -2; k <= 4; k++) {
  const base = Math.pow(10, k);
  ZIP318_DENOMS.push(1 * base, 2 * base, 5 * base);
}

// Power-of-10 denominations (broader set used by Cake/zkool2)
const POWER_OF_10_DENOMS = [];
for (let k = -3; k <= 4; k++) {
  POWER_OF_10_DENOMS.push(Math.pow(10, k));
}

const DENOM_TOLERANCE = 0.002;

function matchesDenomSet(zec, denomSet) {
  for (const d of denomSet) {
    if (d === 0) continue;
    if (Math.abs(zec - d) / d <= DENOM_TOLERANCE) return true;
  }
  return false;
}

/**
 * Determine which denomination series the amount belongs to.
 * Returns: 'zip318' | 'power-of-10' | 'non-standard'
 */
function classifyDenomSeries(zec) {
  if (matchesDenomSet(zec, ZIP318_DENOMS)) return 'zip318';
  if (matchesDenomSet(zec, POWER_OF_10_DENOMS)) return 'power-of-10';
  return 'non-standard';
}

// ─── Signal Matchers ─────────────────────────────────────────────────────────

function matchIronwoodActions(value, expected) {
  return value === expected;
}

function matchFee(value, expected) {
  return value === expected;
}

function matchExpiryDelta(value, expected) {
  if (!expected || value == null) return false;
  return value >= expected.min && value <= expected.max;
}

function matchAnchor(value, expected) {
  return value === expected;
}

function matchDenom(series, expected) {
  if (expected === 'zip318') return series === 'zip318';
  if (expected === 'power-of-10') return series === 'zip318' || series === 'power-of-10';
  return false;
}

// ─── Classifier ──────────────────────────────────────────────────────────────

/**
 * Classify a migration transaction into an implementation family.
 *
 * @param {object} tx
 * @param {number} tx.ironwoodActions - Ironwood bundle action count
 * @param {number} tx.orchardActions - Orchard bundle action count
 * @param {number} tx.fee - Transaction fee in zatoshis
 * @param {number|null} tx.expiryDelta - (expiry_height - block_height), null if no expiry
 * @param {boolean} tx.anchorOnGrid - Whether anchor matches a mod-144 boundary
 * @param {number} tx.amountZec - Migration amount in ZEC
 * @param {number} tx.locktime - nLockTime value
 * @returns {{ family: string, confidence: string, label: string, shortLabel: string, signals: object }}
 */
function classifyMigration(tx) {
  const { ironwoodActions, orchardActions, fee, expiryDelta, anchorOnGrid, amountZec } = tx;

  // Multi-action migrations get their own category
  if (orchardActions > 2) {
    return {
      family: FAMILIES.MULTI_ACTION.id,
      confidence: 'medium',
      label: FAMILIES.MULTI_ACTION.label,
      shortLabel: FAMILIES.MULTI_ACTION.shortLabel,
      signals: buildSignals(tx, null),
    };
  }

  const denomSeries = classifyDenomSeries(amountZec);

  // Score each candidate family
  const candidates = [FAMILIES.ZIP318_CURRENT_SDK, FAMILIES.CAKE_ZKOOL2];
  let bestFamily = FAMILIES.UNKNOWN;
  let bestScore = 0;
  let bestSignals = null;

  for (const family of candidates) {
    const exp = family.expected;
    const signals = {
      ironwoodActions: {
        value: ironwoodActions,
        expected: exp.ironwoodActions,
        match: matchIronwoodActions(ironwoodActions, exp.ironwoodActions),
      },
      fee: {
        value: fee,
        expected: exp.fee,
        match: matchFee(fee, exp.fee),
      },
      expiryDelta: {
        value: expiryDelta,
        expected: `${exp.expiryDelta.min}-${exp.expiryDelta.max}`,
        match: matchExpiryDelta(expiryDelta, exp.expiryDelta),
      },
      anchorOnGrid: {
        value: anchorOnGrid,
        expected: exp.anchorOnGrid,
        match: matchAnchor(anchorOnGrid, exp.anchorOnGrid),
      },
      denomSeries: {
        value: denomSeries,
        expected: exp.denomSeries,
        match: matchDenom(denomSeries, exp.denomSeries),
      },
    };

    const score = Object.values(signals).filter(s => s.match).length;
    if (score > bestScore) {
      bestScore = score;
      bestFamily = family;
      bestSignals = signals;
    }
  }

  // Confidence based on signal match count
  let confidence;
  if (bestScore >= 5) confidence = 'high';
  else if (bestScore >= 4) confidence = 'medium';
  else confidence = 'low';

  // If score is too low, classify as unknown
  if (bestScore <= 2) {
    return {
      family: FAMILIES.UNKNOWN.id,
      confidence: 'low',
      label: FAMILIES.UNKNOWN.label,
      shortLabel: FAMILIES.UNKNOWN.shortLabel,
      signals: bestSignals || buildSignals(tx, null),
    };
  }

  return {
    family: bestFamily.id,
    confidence,
    label: bestFamily.label,
    shortLabel: bestFamily.shortLabel,
    signals: bestSignals,
  };
}

function buildSignals(tx, _family) {
  const denomSeries = classifyDenomSeries(tx.amountZec);
  return {
    ironwoodActions: { value: tx.ironwoodActions, expected: null, match: null },
    fee: { value: tx.fee, expected: null, match: null },
    expiryDelta: { value: tx.expiryDelta, expected: null, match: null },
    anchorOnGrid: { value: tx.anchorOnGrid, expected: null, match: null },
    denomSeries: { value: denomSeries, expected: null, match: null },
  };
}

module.exports = {
  classifyMigration,
  classifyDenomSeries,
  FAMILIES,
  ZIP318_DENOMS,
  POWER_OF_10_DENOMS,
};
