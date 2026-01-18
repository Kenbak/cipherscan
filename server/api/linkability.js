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

  // Minimum amount to consider for linkability (filter out dust)
  // 0.001 ZEC = 100,000 zatoshis
  MIN_AMOUNT_ZAT: 100000, // 0.001 ZEC

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
 * More aggressive dropoff - only very short gaps are truly suspicious
 *
 * < 15 min = 30 (very suspicious - likely same session)
 * < 1 hour = 25 (suspicious)
 * < 2 hours = 20 (medium-high)
 * < 6 hours = 12 (medium - could be coincidence)
 * < 24 hours = 8 (low-medium)
 * > 24 hours = 5 or less (likely unrelated)
 */
function scoreTimeProximity(timeDeltaSeconds) {
  const minutes = timeDeltaSeconds / 60;
  const hours = timeDeltaSeconds / 3600;
  const days = hours / 24;

  if (minutes < 15) return 30;    // Very suspicious - same session
  if (hours < 1) return 25;       // Suspicious
  if (hours < 2) return 20;       // Medium-high
  if (hours < 6) return 12;       // Medium
  if (hours < 24) return 8;       // Low-medium
  if (days < 3) return 5;         // Low
  if (days < 7) return 4;         // Very low
  if (days < 30) return 3;        // Minimal
  return 2;                       // Almost irrelevant
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

  // 5. Count occurrences of EXACT amount (for rarity score)
  // Use exact match to be consistent with /api/privacy/risks
  const rarityResult = await pool.query(`
    SELECT COUNT(*) as count
    FROM shielded_flows
    WHERE amount_zat = $1
      AND block_time > $2
  `, [amountZat, minTime]);

  const amountOccurrences = parseInt(rarityResult.rows[0].count) || 1;

  // 6. Score each match using the unified scoring function
  const scoredMatches = matchResult.rows.map(match => {
    const matchAmountZat = parseInt(match.amount_zat);
    const matchBlockTime = parseInt(match.block_time);
    const timeDelta = matchBlockTime - blockTime; // Negative if before

    // Use unified scoring function (single source of truth)
    const { score, warningLevel, breakdown } = calculateLinkabilityScore(
      amountZat,
      matchAmountZat,
      timeDelta,
      amountOccurrences
    );

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
      linkabilityScore: score,
      warningLevel,
      scoreBreakdown: breakdown,
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
// ============================================================================
// UNIFIED SCORING FUNCTION
// ============================================================================

/**
 * Calculate the complete linkability score for a shield/deshield pair.
 * This is the single source of truth for scoring - use this everywhere!
 *
 * Score = amountSimilarity (0-40) + timeProximity (0-30) + amountRarity (0-30) + bonus/malus = max 100
 *
 * @param {number} shieldAmountZat - Shield amount in zatoshis
 * @param {number} deshieldAmountZat - Deshield amount in zatoshis
 * @param {number} timeDeltaSeconds - Time between shield and deshield (absolute value)
 * @param {number} amountOccurrences - How many times this amount appears in the dataset (optional, defaults to 1 = rare)
 * @returns {object} - { score, warningLevel, breakdown: { amountSimilarity, timeProximity, amountRarity } }
 */
function calculateLinkabilityScore(shieldAmountZat, deshieldAmountZat, timeDeltaSeconds, amountOccurrences = 1) {
  // Calculate component scores
  const amountScore = scoreAmountSimilarity(shieldAmountZat, deshieldAmountZat);
  const timeScore = scoreTimeProximity(Math.abs(timeDeltaSeconds));
  const rarityScore = scoreAmountRarity(amountOccurrences);

  // Base score
  let totalScore = amountScore + timeScore + rarityScore;

  // Apply rarity/time bonus or malus
  totalScore = applyRarityTimeBonus(totalScore, rarityScore, timeScore, amountOccurrences);

  // Ensure score is within 0-100
  totalScore = Math.min(Math.max(totalScore, 0), 100);

  return {
    score: totalScore,
    warningLevel: getWarningLevel(totalScore),
    breakdown: {
      amountSimilarity: amountScore,
      timeProximity: timeScore,
      amountRarity: rarityScore,
    },
  };
}

// ============================================================================
// BATCH DESHIELD DETECTION (NEW HEURISTIC)
// ============================================================================

/**
 * Check if an amount is a "round" psychological number
 * These are amounts humans naturally choose, making them fingerprints
 * 
 * IMPROVED: Uses fee tolerance (0.001 ZEC) to handle amounts like 50.0003 ZEC
 */
function isRoundAmount(amountZec) {
  const FEE_TOLERANCE = 0.001; // Typical Zcash fee is 0.0001-0.001 ZEC
  
  // Common round amounts people use
  const exactRounds = [
    0.1, 0.5, 1, 2, 5, 10, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000
  ];

  // Check if close to any exact round (within fee tolerance)
  for (const round of exactRounds) {
    if (Math.abs(amountZec - round) < FEE_TOLERANCE) return true;
  }

  // Check if it's close to a multiple of 1000 (for amounts >= 1000)
  if (amountZec >= 1000 && (amountZec % 1000) < FEE_TOLERANCE) return true;
  
  // Check if it's close to a multiple of 500 (for amounts >= 500)
  if (amountZec >= 500 && (amountZec % 500) < FEE_TOLERANCE) return true;

  // Check if it's close to a multiple of 100 (for amounts >= 100)
  if (amountZec >= 100 && (amountZec % 100) < FEE_TOLERANCE) return true;

  // Check if it's close to a multiple of 50 (for amounts >= 50)
  if (amountZec >= 50 && (amountZec % 50) < FEE_TOLERANCE) return true;

  // Check if it's close to a multiple of 10 (for amounts >= 10)
  if (amountZec >= 10 && (amountZec % 10) < FEE_TOLERANCE) return true;

  // Check if it's close to a whole number (for amounts >= 1)
  if (amountZec >= 1 && (amountZec % 1) < FEE_TOLERANCE) return true;

  return false;
}

/**
 * Score how "round" an amount is (more round = more suspicious)
 * Returns 0-25 points
 * 
 * IMPROVED: Uses fee tolerance to properly detect 50.0003 as "50 ZEC"
 */
function scoreRoundness(amountZec) {
  const FEE_TOLERANCE = 0.001;
  
  // Check multiples with tolerance (most specific first)
  if (amountZec >= 1000 && (amountZec % 1000) < FEE_TOLERANCE) return 25; // 1000, 2000, 5000...
  if (amountZec >= 500 && (amountZec % 500) < FEE_TOLERANCE) return 22;   // 500, 1500, 2500...
  if (amountZec >= 100 && (amountZec % 100) < FEE_TOLERANCE) return 20;   // 100, 200, 300...
  if (amountZec >= 50 && (amountZec % 50) < FEE_TOLERANCE) return 15;     // 50, 150, 250...
  if (amountZec >= 10 && (amountZec % 10) < FEE_TOLERANCE) return 12;     // 10, 20, 30...
  if (amountZec >= 1 && (amountZec % 1) < FEE_TOLERANCE) return 8;        // Whole numbers
  return 0;
}

/**
 * Detect "batch deshield" patterns where someone:
 * 1. Shields a large amount
 * 2. Deshields in identical chunks that sum to the original
 *
 * Example: 6000 ZEC in → 12×500 ZEC out
 *
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {object} options - Detection options
 * @returns {Array} - Array of suspicious batch patterns
 */
async function detectBatchDeshields(pool, options = {}) {
  const {
    minBatchCount = 3,           // At least 3 identical deshields
    minAmountZat = 1000000000,   // Min 10 ZEC per deshield (to filter noise)
    timeWindowDays = 30,         // Look back 30 days
    limit = 50,                  // Max patterns to return
  } = options;

  const nowSeconds = Math.floor(Date.now() / 1000);
  const minTime = nowSeconds - (timeWindowDays * 86400);

  // Step 1: Find batches of identical deshields (including addresses)
  const batchesResult = await pool.query(`
    SELECT
      amount_zat,
      COUNT(*) as batch_count,
      SUM(amount_zat) as total_zat,
      MIN(block_time) as first_time,
      MAX(block_time) as last_time,
      ARRAY_AGG(txid ORDER BY block_time) as txids,
      ARRAY_AGG(block_height ORDER BY block_time) as heights,
      ARRAY_AGG(block_time ORDER BY block_time) as times,
      ARRAY_AGG(COALESCE(transparent_addresses[1], '') ORDER BY block_time) as addresses
    FROM shielded_flows
    WHERE flow_type = 'deshield'
      AND block_time > $1
      AND amount_zat >= $2
    GROUP BY amount_zat
    HAVING COUNT(*) >= $3
    ORDER BY COUNT(*) DESC, SUM(amount_zat) DESC
    LIMIT $4
  `, [minTime, minAmountZat, minBatchCount, limit]);

  const suspiciousBatches = [];

  for (const batch of batchesResult.rows) {
    const batchTotal = parseInt(batch.total_zat);
    const batchCount = parseInt(batch.batch_count);
    const perTxAmount = parseInt(batch.amount_zat);
    const firstTime = parseInt(batch.first_time);
    const lastTime = parseInt(batch.last_time);
    const amountZec = perTxAmount / 100000000;
    const totalZec = batchTotal / 100000000;

    // Step 2: Find matching shields (total matches batch total)
    const matchingShields = await pool.query(`
      SELECT txid, amount_zat, block_time, block_height
      FROM shielded_flows
      WHERE flow_type = 'shield'
        AND amount_zat BETWEEN $1 AND $2
        AND block_time < $3
        AND block_time > $3 - (90 * 86400)
      ORDER BY ABS(amount_zat - $4) ASC, block_time DESC
      LIMIT 5
    `, [
      batchTotal - CONFIG.AMOUNT_TOLERANCE_ZAT * 10, // Wider tolerance for sums
      batchTotal + CONFIG.AMOUNT_TOLERANCE_ZAT * 10,
      firstTime,
      batchTotal
    ]);

    // Step 3: Score this pattern
    let score = 0;
    const breakdown = {};

    // Factor 1: Batch count (more identical = more suspicious)
    // 3 = 10pts, 5 = 15pts, 8 = 20pts, 12+ = 30pts
    let batchPoints = 0;
    if (batchCount >= 12) batchPoints = 30;
    else if (batchCount >= 8) batchPoints = 25;
    else if (batchCount >= 5) batchPoints = 20;
    else if (batchCount >= 3) batchPoints = 10;
    score += batchPoints;
    breakdown.batchCount = { count: batchCount, points: batchPoints };

    // Factor 2: Round number (psychological fingerprint)
    const roundPoints = scoreRoundness(amountZec);
    score += roundPoints;
    breakdown.roundNumber = {
      amountZec,
      isRound: roundPoints > 0,
      points: roundPoints
    };

    // Factor 3: Matching shield found (strongest signal)
    let matchPoints = 0;
    let bestMatch = null;
    if (matchingShields.rows.length > 0) {
      bestMatch = matchingShields.rows[0];
      const matchAmount = parseInt(bestMatch.amount_zat);
      const diff = Math.abs(matchAmount - batchTotal);

      // Closer match = more points
      if (diff === 0) matchPoints = 35;
      else if (diff <= CONFIG.AMOUNT_TOLERANCE_ZAT) matchPoints = 32;
      else if (diff <= CONFIG.AMOUNT_TOLERANCE_ZAT * 5) matchPoints = 28;
      else matchPoints = 20;

      score += matchPoints;
    }
    breakdown.matchingShield = {
      found: !!bestMatch,
      txid: bestMatch?.txid || null,
      amountZec: bestMatch ? parseInt(bestMatch.amount_zat) / 100000000 : null,
      points: matchPoints
    };

    // Factor 4: Time clustering (all withdrawals close together = more suspicious)
    const timeSpanHours = (lastTime - firstTime) / 3600;
    let timePoints = 0;
    if (timeSpanHours < 6) timePoints = 10;      // < 6 hours = very clustered
    else if (timeSpanHours < 24) timePoints = 8; // < 1 day
    else if (timeSpanHours < 72) timePoints = 5; // < 3 days
    else if (timeSpanHours < 168) timePoints = 3; // < 1 week
    score += timePoints;
    breakdown.timeClustering = {
      hours: Math.round(timeSpanHours * 10) / 10,
      points: timePoints
    };

    // Factor 5: Address analysis (MEGA suspicious if same address receives all)
    const addresses = (batch.addresses || []).filter(a => a && a.length > 0);
    const uniqueAddresses = [...new Set(addresses)];
    const addressCount = uniqueAddresses.length;
    let addressPoints = 0;
    let sameAddressRatio = 0;
    
    if (addresses.length > 0 && addressCount > 0) {
      sameAddressRatio = 1 - (addressCount - 1) / Math.max(addresses.length - 1, 1);
      
      if (addressCount === 1 && addresses.length >= 3) {
        // ALL deshields go to SAME address = EXTREMELY suspicious
        addressPoints = 20;
      } else if (addressCount <= 2 && addresses.length >= 5) {
        // 1-2 addresses for 5+ deshields = very suspicious
        addressPoints = 15;
      } else if (addressCount <= 3 && addresses.length >= 8) {
        // 3 addresses for 8+ deshields = suspicious
        addressPoints = 10;
      } else if (sameAddressRatio > 0.5) {
        // More than 50% reuse = somewhat suspicious
        addressPoints = 5;
      }
    }
    score += addressPoints;
    breakdown.addressAnalysis = {
      totalAddresses: addresses.length,
      uniqueAddresses: addressCount,
      sameAddressRatio: Math.round(sameAddressRatio * 100),
      topAddresses: uniqueAddresses.slice(0, 3),
      points: addressPoints
    };

    // Factor 6: Time between shield and first deshield (faster = more suspicious)
    let shieldToFirstDeshieldPoints = 0;
    let shieldToFirstDeshieldHours = null;
    if (bestMatch) {
      const shieldTime = parseInt(bestMatch.block_time);
      shieldToFirstDeshieldHours = (firstTime - shieldTime) / 3600;
      
      if (shieldToFirstDeshieldHours < 1) {
        shieldToFirstDeshieldPoints = 10;  // < 1 hour = very suspicious
      } else if (shieldToFirstDeshieldHours < 6) {
        shieldToFirstDeshieldPoints = 8;   // < 6 hours
      } else if (shieldToFirstDeshieldHours < 24) {
        shieldToFirstDeshieldPoints = 5;   // < 1 day
      } else if (shieldToFirstDeshieldHours < 72) {
        shieldToFirstDeshieldPoints = 3;   // < 3 days
      }
      // > 3 days = 0 points (patient = less suspicious)
    }
    score += shieldToFirstDeshieldPoints;
    breakdown.shieldTiming = {
      hoursAfterShield: shieldToFirstDeshieldHours ? Math.round(shieldToFirstDeshieldHours * 10) / 10 : null,
      points: shieldToFirstDeshieldPoints
    };

    // Minimum score threshold
    if (score < 30) continue;

    suspiciousBatches.push({
      patternType: 'BATCH_DESHIELD',
      perTxAmountZec: amountZec,
      batchCount,
      totalAmountZec: totalZec,
      txids: batch.txids,
      heights: batch.heights.map(h => parseInt(h)),
      times: batch.times.map(t => parseInt(t)),
      addresses: uniqueAddresses,
      addressCount: addressCount,
      sameAddressRatio: Math.round(sameAddressRatio * 100),
      firstTime,
      lastTime,
      timeSpanHours: Math.round(timeSpanHours * 10) / 10,
      shieldToFirstDeshieldHours: shieldToFirstDeshieldHours ? Math.round(shieldToFirstDeshieldHours * 10) / 10 : null,
      isRoundNumber: roundPoints > 0,
      matchingShield: bestMatch ? {
        txid: bestMatch.txid,
        amountZec: parseInt(bestMatch.amount_zat) / 100000000,
        blockHeight: parseInt(bestMatch.block_height),
        blockTime: parseInt(bestMatch.block_time),
      } : null,
      score: Math.min(score, 100),
      warningLevel: score >= 70 ? 'HIGH' : score >= 50 ? 'MEDIUM' : 'LOW',
      breakdown,
      explanation: generateBatchExplanation(batchCount, amountZec, totalZec, bestMatch, timeSpanHours, addressCount, shieldToFirstDeshieldHours),
    });
  }

  // Sort by score descending
  return suspiciousBatches.sort((a, b) => b.score - a.score);
}

/**
 * Generate human-readable explanation for a batch pattern
 */
function generateBatchExplanation(batchCount, amountZec, totalZec, matchingShield, timeSpanHours, addressCount = null, shieldToFirstDeshieldHours = null) {
  let explanation = `Detected ${batchCount} identical deshields of ${amountZec} ZEC each (total: ${totalZec} ZEC)`;
  
  if (timeSpanHours < 24) {
    explanation += ` within ${Math.round(timeSpanHours)} hours`;
  } else if (timeSpanHours < 168) {
    explanation += ` over ${Math.round(timeSpanHours / 24)} days`;
  }
  
  explanation += '. ';
  
  // Address analysis
  if (addressCount !== null) {
    if (addressCount === 1) {
      explanation += `⚠️ ALL withdrawals go to the SAME address! `;
    } else if (addressCount <= 2 && batchCount >= 5) {
      explanation += `Only ${addressCount} unique addresses for ${batchCount} withdrawals. `;
    }
  }
  
  if (matchingShield) {
    const shieldAmount = parseInt(matchingShield.amount_zat) / 100000000;
    explanation += `Matches a shield of ${shieldAmount} ZEC`;
    
    // Timing info
    if (shieldToFirstDeshieldHours !== null) {
      if (shieldToFirstDeshieldHours < 24) {
        explanation += ` (first withdrawal ${Math.round(shieldToFirstDeshieldHours)}h after shielding)`;
      } else {
        explanation += ` (first withdrawal ${Math.round(shieldToFirstDeshieldHours / 24)} days after shielding)`;
      }
    }
    
    explanation += ', strongly suggesting these withdrawals came from the same source.';
  } else {
    explanation += `No exact matching shield found, but the identical amounts and timing pattern is a privacy fingerprint.`;
  }
  
  return explanation;
}

/**
 * Detect patterns for a specific shield transaction
 * Check if this shield was later deshielded in batches
 */
async function detectBatchForShield(pool, shieldTxid) {
  // Get the shield transaction
  const shieldResult = await pool.query(`
    SELECT txid, amount_zat, block_time, block_height
    FROM shielded_flows
    WHERE txid = $1 AND flow_type = 'shield'
  `, [shieldTxid]);

  if (shieldResult.rows.length === 0) {
    return { error: 'Shield transaction not found', txid: shieldTxid };
  }

  const shield = shieldResult.rows[0];
  const shieldAmount = parseInt(shield.amount_zat);
  const shieldTime = parseInt(shield.block_time);
  const shieldZec = shieldAmount / 100000000;

  // Find potential divisors (how the amount could be split)
  const potentialDivisors = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 50, 100];
  const matches = [];

  for (const divisor of potentialDivisors) {
    const expectedPerTx = Math.round(shieldAmount / divisor);
    if (expectedPerTx < 100000000) continue; // Skip if < 1 ZEC per tx

    // Find deshields with this amount after the shield
    const deshieldsResult = await pool.query(`
      SELECT txid, amount_zat, block_time, block_height
      FROM shielded_flows
      WHERE flow_type = 'deshield'
        AND amount_zat BETWEEN $1 AND $2
        AND block_time > $3
        AND block_time < $3 + (90 * 86400)
      ORDER BY block_time ASC
    `, [
      expectedPerTx - CONFIG.AMOUNT_TOLERANCE_ZAT,
      expectedPerTx + CONFIG.AMOUNT_TOLERANCE_ZAT,
      shieldTime
    ]);

    if (deshieldsResult.rows.length >= divisor * 0.5) { // At least 50% of expected
      const totalDeshielded = deshieldsResult.rows.reduce(
        (sum, r) => sum + parseInt(r.amount_zat), 0
      );

      // Check if total is close to shield amount
      const diffPercent = Math.abs(totalDeshielded - shieldAmount) / shieldAmount * 100;

      if (diffPercent < 5) { // Within 5% of original
        matches.push({
          divisor,
          expectedPerTxZec: expectedPerTx / 100000000,
          foundCount: deshieldsResult.rows.length,
          totalDeshieldedZec: totalDeshielded / 100000000,
          diffPercent: Math.round(diffPercent * 100) / 100,
          deshields: deshieldsResult.rows.map(r => ({
            txid: r.txid,
            amountZec: parseInt(r.amount_zat) / 100000000,
            blockHeight: parseInt(r.block_height),
            blockTime: parseInt(r.block_time),
          })),
        });
      }
    }
  }

  return {
    shieldTxid,
    shieldAmountZec: shieldZec,
    shieldBlockHeight: parseInt(shield.block_height),
    shieldBlockTime: shieldTime,
    potentialBatchWithdrawals: matches,
    hasBatchPattern: matches.length > 0,
    warningLevel: matches.length > 0 ? 'HIGH' : 'NONE',
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  findLinkedTransactions,
  getTransparentAddresses,
  calculateLinkabilityScore,
  CONFIG,
  // Export individual functions for testing/backwards compatibility
  scoreAmountSimilarity,
  scoreTimeProximity,
  scoreAmountRarity,
  applyRarityTimeBonus,
  getWarningLevel,
  formatTimeDelta,
  // NEW: Batch detection exports
  detectBatchDeshields,
  detectBatchForShield,
  isRoundAmount,
  scoreRoundness,
  generateBatchExplanation,
};
