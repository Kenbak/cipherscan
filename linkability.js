/**
 * Linkability Detection Algorithm
 *
 * Detects potential "round-trip" transactions where someone:
 * 1. Shields X ZEC (transparent → shielded)
 * 2. Later deshields ~X ZEC (shielded → transparent)
 *
 * Based on Zooko's idea for privacy education:
 * "If amounts are nearly identical (within tx fee tolerance), flag them as potentially linked."
 *
 * @see docs/FEATURES_ROADMAP.md for full context
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Amount tolerance in zatoshis (fixed, not percentage)
  // Zcash fees are typically 0.0001 ZEC = 10,000 zatoshis
  // We use 0.001 ZEC = 100,000 zatoshis to be safe
  AMOUNT_TOLERANCE_ZAT: 100000, // 0.001 ZEC

  // Maximum time window to search (90 days in seconds)
  MAX_TIME_WINDOW_SECONDS: 90 * 24 * 60 * 60,

  // Maximum results to return
  MAX_RESULTS: 5,

  // Rarity thresholds (occurrences in 90 days)
  RARITY: {
    VERY_RARE: 3,    // < 3 = very rare
    RARE: 10,        // < 10 = rare
    COMMON: 50,      // > 50 = common
  },

  // Score weights
  WEIGHTS: {
    AMOUNT_SIMILARITY: 40,  // Max 40 points
    TIME_PROXIMITY: 30,     // Max 30 points
    AMOUNT_RARITY: 30,      // Max 30 points
  },

  // Warning thresholds
  WARNING: {
    HIGH: 70,
    MEDIUM: 40,
  },
};

// ============================================================================
// SCORING FUNCTIONS
// ============================================================================

/**
 * Calculate amount similarity score (0-40 points)
 * Based on absolute difference in zatoshis (not percentage)
 *
 * Zcash fees are ~0.0001 ZEC = 10,000 zatoshis
 * Exact match = 40, within fee = 38, within 2x fee = 35, etc.
 */
function scoreAmountSimilarity(amount1Zat, amount2Zat) {
  const diff = Math.abs(amount1Zat - amount2Zat);

  // Scoring based on absolute difference
  if (diff === 0) return 40;                    // Exact match
  if (diff <= 10000) return 38;                 // Within 0.0001 ZEC (typical fee)
  if (diff <= 20000) return 36;                 // Within 0.0002 ZEC
  if (diff <= 50000) return 33;                 // Within 0.0005 ZEC
  if (diff <= 100000) return 30;                // Within 0.001 ZEC (our tolerance)
  if (diff <= 200000) return 25;                // Within 0.002 ZEC
  if (diff <= 500000) return 20;                // Within 0.005 ZEC
  if (diff <= 1000000) return 15;               // Within 0.01 ZEC
  return 10; // Still matched but larger difference
}

/**
 * Calculate time proximity score (0-30 points)
 * < 1 hour = 30, < 24h = 25, < 7 days = 15, < 30 days = 10, < 90 days = 5
 */
function scoreTimeProximity(timeDeltaSeconds) {
  const hours = timeDeltaSeconds / 3600;
  const days = hours / 24;

  if (hours < 1) return 30;
  if (hours < 6) return 27;
  if (hours < 24) return 25;
  if (days < 3) return 20;
  if (days < 7) return 15;
  if (days < 14) return 12;
  if (days < 30) return 10;
  if (days < 60) return 7;
  if (days < 90) return 5;
  return 3;
}

/**
 * Calculate amount rarity score (0-30 points)
 * Unique = 30, < 5 = 25, < 10 = 20, < 20 = 15, < 50 = 10, >= 50 = 5
 */
function scoreAmountRarity(occurrences) {
  if (occurrences <= 1) return 30;
  if (occurrences <= 3) return 27;
  if (occurrences <= 5) return 25;
  if (occurrences <= 10) return 20;
  if (occurrences <= 20) return 15;
  if (occurrences <= 50) return 10;
  return 5;
}

/**
 * Apply bonus/malus based on rarity + time combination
 */
function applyRarityTimeBonus(baseScore, rarityScore, timeScore, occurrences) {
  // If amount is VERY rare, time matters less
  // Even a 30-day gap is suspicious for unique amounts
  if (occurrences <= CONFIG.RARITY.VERY_RARE && timeScore < 15) {
    // Boost time score for rare amounts
    return baseScore + 10;
  }

  // If amount is VERY common, require strong time proximity
  if (occurrences >= CONFIG.RARITY.COMMON && timeScore < 20) {
    // Penalize common amounts without time proximity
    return Math.max(baseScore - 15, 10);
  }

  return baseScore;
}

/**
 * Determine warning level based on score
 */
function getWarningLevel(score) {
  if (score >= CONFIG.WARNING.HIGH) return 'HIGH';
  if (score >= CONFIG.WARNING.MEDIUM) return 'MEDIUM';
  return 'LOW';
}

/**
 * Format time delta as human readable string
 */
function formatTimeDelta(seconds) {
  const absSeconds = Math.abs(seconds);
  const suffix = seconds > 0 ? 'after' : 'before';

  if (absSeconds < 60) return `${Math.round(absSeconds)} seconds ${suffix}`;
  if (absSeconds < 3600) return `${Math.round(absSeconds / 60)} minutes ${suffix}`;
  if (absSeconds < 86400) return `${Math.round(absSeconds / 3600)} hours ${suffix}`;
  if (absSeconds < 604800) return `${(absSeconds / 86400).toFixed(1)} days ${suffix}`;
  return `${Math.round(absSeconds / 604800)} weeks ${suffix}`;
}

// ============================================================================
// MAIN DETECTION FUNCTION
// ============================================================================

/**
 * Get transparent addresses involved in a transaction
 * For shield: the INPUT addresses (source of funds being shielded)
 * For deshield: the OUTPUT addresses (recipients of unshielded funds)
 */
async function getTransparentAddresses(pool, txid, flowType) {
  if (flowType === 'shield') {
    // Get input addresses (where ZEC came from before shielding)
    const result = await pool.query(`
      SELECT DISTINCT address FROM transaction_inputs
      WHERE txid = $1 AND address IS NOT NULL
    `, [txid]);
    return result.rows.map(r => r.address);
  } else {
    // Get output addresses (where ZEC is going after deshielding)
    const result = await pool.query(`
      SELECT DISTINCT address FROM transaction_outputs
      WHERE txid = $1 AND address IS NOT NULL
    `, [txid]);
    return result.rows.map(r => r.address);
  }
}

/**
 * Find potentially linked transactions for a given txid
 *
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {string} txid - Transaction ID to analyze
 * @param {object} options - Optional parameters
 * @returns {object} Linkability analysis result
 */
async function findLinkedTransactions(pool, txid, options = {}) {
  const limit = options.limit || CONFIG.MAX_RESULTS;
  // Tolerance in ZEC, converted to zatoshis. Default 0.001 ZEC
  const toleranceZat = options.toleranceZat || CONFIG.AMOUNT_TOLERANCE_ZAT;

  // 1. Get the transaction from shielded_flows
  const txResult = await pool.query(`
    SELECT txid, block_height, block_time, flow_type, amount_zat, pool
    FROM shielded_flows
    WHERE txid = $1
  `, [txid]);

  if (txResult.rows.length === 0) {
    // Transaction not in shielded_flows - check if it exists at all
    const txCheck = await pool.query(
      'SELECT txid FROM transactions WHERE txid = $1',
      [txid]
    );

    if (txCheck.rows.length === 0) {
      return { error: 'Transaction not found', code: 'TX_NOT_FOUND' };
    }

    // Transaction exists but has no shielding activity
    return {
      txid,
      flowType: null,
      hasShieldedActivity: false,
      linkedTransactions: [],
      message: 'This transaction has no shielding or deshielding activity',
    };
  }

  const tx = txResult.rows[0];
  const amountZat = parseInt(tx.amount_zat);
  const blockTime = parseInt(tx.block_time);

  // Get transparent addresses for the current transaction
  const currentAddresses = await getTransparentAddresses(pool, txid, tx.flow_type);

  // 2. Determine search direction
  // If DESHIELD → search for SHIELDS before
  // If SHIELD → search for DESHIELDS after
  const searchFlowType = tx.flow_type === 'deshield' ? 'shield' : 'deshield';
  const isDeshield = tx.flow_type === 'deshield';

  // 3. Calculate amount range (±fixed tolerance in zatoshis)
  const minAmount = amountZat - toleranceZat;
  const maxAmount = amountZat + toleranceZat;

  // 4. Find matching transactions
  // For deshield: search for shields BEFORE (block_time < current)
  // For shield: search for deshields AFTER (block_time > current)
  let matchResult;

  // Calculate time bounds
  const minTime = blockTime - CONFIG.MAX_TIME_WINDOW_SECONDS;
  const maxTime = blockTime + CONFIG.MAX_TIME_WINDOW_SECONDS;

  if (isDeshield) {
    // Search for shields BEFORE this deshield
    matchResult = await pool.query(`
      SELECT txid, block_height, block_time, flow_type, amount_zat, pool
      FROM shielded_flows
      WHERE flow_type = $1
        AND amount_zat BETWEEN $2 AND $3
        AND block_time < $4
        AND block_time > $5
        AND txid != $6
      ORDER BY block_time DESC
      LIMIT 50
    `, [searchFlowType, minAmount, maxAmount, blockTime, minTime, txid]);
  } else {
    // Search for deshields AFTER this shield
    matchResult = await pool.query(`
      SELECT txid, block_height, block_time, flow_type, amount_zat, pool
      FROM shielded_flows
      WHERE flow_type = $1
        AND amount_zat BETWEEN $2 AND $3
        AND block_time > $4
        AND block_time < $5
        AND txid != $6
      ORDER BY block_time ASC
      LIMIT 50
    `, [searchFlowType, minAmount, maxAmount, blockTime, maxTime, txid]);
  }

  // 5. Count occurrences of similar amounts (for rarity score)
  const rarityResult = await pool.query(`
    SELECT COUNT(*) as count
    FROM shielded_flows
    WHERE amount_zat BETWEEN $1 AND $2
      AND block_time > $3
      AND block_time < $4
  `, [minAmount, maxAmount, minTime, maxTime]);

  const amountOccurrences = parseInt(rarityResult.rows[0].count) || 1;

  // 6. Score each match (without addresses first for performance)
  const scoredMatches = matchResult.rows.map(match => {
    const matchAmountZat = parseInt(match.amount_zat);
    const matchBlockTime = parseInt(match.block_time);
    const timeDelta = matchBlockTime - blockTime; // Negative if before

    // Calculate component scores
    const amountScore = scoreAmountSimilarity(amountZat, matchAmountZat);
    const timeScore = scoreTimeProximity(Math.abs(timeDelta));
    const rarityScore = scoreAmountRarity(amountOccurrences);

    // Base score
    let totalScore = amountScore + timeScore + rarityScore;

    // Apply rarity/time bonus or malus
    totalScore = applyRarityTimeBonus(totalScore, rarityScore, timeScore, amountOccurrences);

    // Ensure score is within 0-100
    totalScore = Math.min(Math.max(totalScore, 0), 100);

    return {
      txid: match.txid,
      flowType: match.flow_type,
      amount: matchAmountZat / 100000000, // Convert to ZEC
      amountZat: matchAmountZat,
      blockHeight: match.block_height,
      blockTime: matchBlockTime,
      pool: match.pool,
      timeDelta: formatTimeDelta(timeDelta),
      timeDeltaSeconds: timeDelta,
      linkabilityScore: totalScore,
      warningLevel: getWarningLevel(totalScore),
      scoreBreakdown: {
        amountSimilarity: amountScore,
        timeProximity: timeScore,
        amountRarity: rarityScore,
      },
    };
  });

  // 7. Sort by score and limit results
  scoredMatches.sort((a, b) => b.linkabilityScore - a.linkabilityScore);
  const topMatches = scoredMatches.slice(0, limit);

  // 7b. Fetch addresses for top matches only (for performance)
  const topMatchesWithAddresses = await Promise.all(
    topMatches.map(async (match) => {
      const addresses = await getTransparentAddresses(pool, match.txid, match.flowType);
      return {
        ...match,
        transparentAddresses: addresses,
      };
    })
  );

  // 8. Determine overall warning level (based on top match)
  const highestScore = topMatchesWithAddresses.length > 0 ? topMatchesWithAddresses[0].linkabilityScore : 0;
  const overallWarning = getWarningLevel(highestScore);

  // 9. Generate educational note with privacy risk explanation
  let educationalNote = null;
  let privacyRiskExplanation = null;

  if (tx.flow_type === 'deshield' && topMatchesWithAddresses.length > 0) {
    // Deshield: Risk is that your receiving address can be linked to a shielding source
    const topMatch = topMatchesWithAddresses[0];
    const yourAddress = currentAddresses.length > 0 ? currentAddresses[0] : 'your address';
    const sourceAddress = topMatch.transparentAddresses?.length > 0 ? topMatch.transparentAddresses[0] : 'a source address';

    privacyRiskExplanation = {
      risk: 'ADDRESS_LINKAGE',
      description: `An observer can see ${yourAddress} received ${(amountZat / 100000000).toFixed(4)} ZEC from the shielded pool. ` +
        `By finding a shielding transaction with a similar amount (${topMatch.amount.toFixed(4)} ZEC from ${sourceAddress} ${topMatch.timeDelta}), ` +
        `they can infer that ${yourAddress} is likely controlled by the same person who owns ${sourceAddress}.`,
      yourAddress: currentAddresses,
      potentialSourceAddresses: topMatch.transparentAddresses || [],
    };
  } else if (tx.flow_type === 'shield' && topMatchesWithAddresses.length > 0) {
    // Shield: Risk is that a future deshield can be linked back to your shielding address
    const topMatch = topMatchesWithAddresses[0];
    const yourAddress = currentAddresses.length > 0 ? currentAddresses[0] : 'your address';
    const destAddress = topMatch.transparentAddresses?.length > 0 ? topMatch.transparentAddresses[0] : 'a destination address';

    privacyRiskExplanation = {
      risk: 'ADDRESS_LINKAGE',
      description: `You shielded ${(amountZat / 100000000).toFixed(4)} ZEC from ${yourAddress}. ` +
        `A similar amount (${topMatch.amount.toFixed(4)} ZEC) was later deshielded to ${destAddress} ${topMatch.timeDelta}. ` +
        `An observer could infer that ${yourAddress} and ${destAddress} are controlled by the same person.`,
      yourAddress: currentAddresses,
      potentialLinkedAddresses: topMatch.transparentAddresses || [],
    };
  }

  if (highestScore >= CONFIG.WARNING.HIGH) {
    educationalNote = `⚠️ HIGH PRIVACY RISK: This transaction's amount is nearly identical to a ${searchFlowType} transaction. ` +
      `This pattern can reveal which addresses belong to the same person. ` +
      `For better privacy: use different amounts, split transactions, and ZODL (hold in shielded pool longer).`;
  } else if (highestScore >= CONFIG.WARNING.MEDIUM) {
    educationalNote = `This ${tx.flow_type} transaction may be linkable to other transactions with similar amounts. ` +
      `For maximum privacy, avoid shielding and deshielding the same amounts.`;
  }

  return {
    txid,
    flowType: tx.flow_type,
    amount: amountZat / 100000000,
    amountZat,
    blockHeight: tx.block_height,
    blockTime,
    pool: tx.pool,
    hasShieldedActivity: true,

    // Current transaction's transparent addresses
    transparentAddresses: currentAddresses,

    // Search info
    searchDirection: tx.flow_type === 'deshield' ? 'before' : 'after',
    searchFlowType,
    toleranceZec: toleranceZat / 100000000,
    amountOccurrences,

    // Results (now with addresses)
    linkedTransactions: topMatchesWithAddresses,
    totalMatches: scoredMatches.length,

    // Warning
    warningLevel: overallWarning,
    highestScore,
    educationalNote,
    privacyRiskExplanation,

    // Config (for transparency - Zooko's request)
    algorithm: {
      version: '1.2',
      toleranceZec: CONFIG.AMOUNT_TOLERANCE_ZAT / 100000000,
      maxTimeWindowDays: CONFIG.MAX_TIME_WINDOW_SECONDS / 86400,
      note: 'This is a heuristic algorithm. Real attackers may use more sophisticated methods. The only foolproof privacy is to ZODL (hold in shielded pool).',
    },
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  findLinkedTransactions,
  getTransparentAddresses,
  CONFIG,
  // Export individual functions for testing
  scoreAmountSimilarity,
  scoreTimeProximity,
  scoreAmountRarity,
  getWarningLevel,
  formatTimeDelta,
};
