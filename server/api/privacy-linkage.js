const crypto = require('crypto');

const ZATOSHI = 100000000;

const CONFIG = {
  MIN_AMOUNT_ZAT: 100000,
  PAIR_TOLERANCE_ZAT: 100000,
  MAX_LINK_WINDOW_SECONDS: 90 * 24 * 60 * 60,
  PAIR_LOOKBACK_DAYS: 30,
  BATCH_LOOKBACK_DAYS: 30,
  MAX_BATCH_GAP_SECONDS: 6 * 60 * 60,
  MIN_BATCH_COUNT: 3,
  MAX_PAIR_CANDIDATES: 8000,
  MAX_BATCH_ROWS: 12000,
  MAX_EDGE_CANDIDATES_PER_TX: 3,
  WARNING: {
    HIGH: 75,
    MEDIUM: 55,
  },
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toZec(zat) {
  return Number(zat || 0) / ZATOSHI;
}

function getWarningLevel(score) {
  if (score >= CONFIG.WARNING.HIGH) return 'HIGH';
  if (score >= CONFIG.WARNING.MEDIUM) return 'MEDIUM';
  return 'LOW';
}

function formatTimeDelta(seconds) {
  const absSeconds = Math.abs(seconds);
  const suffix = seconds > 0 ? 'after' : 'before';

  if (absSeconds < 60) return `${Math.round(absSeconds)} seconds ${suffix}`;
  if (absSeconds < 3600) return `${Math.round(absSeconds / 60)} minutes ${suffix}`;
  if (absSeconds < 86400) return `${Math.round(absSeconds / 3600)} hours ${suffix}`;
  if (absSeconds < 604800) return `${(absSeconds / 86400).toFixed(1)} days ${suffix}`;
  return `${Math.round(absSeconds / 604800)} weeks ${suffix}`;
}

function generateHash(parts) {
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex');
}

function normalizedModulo(value, base) {
  return ((value % base) + base) % base;
}

function withinMultiple(amountZec, multiple, tolerance = 0.001) {
  const remainder = normalizedModulo(amountZec, multiple);
  return Math.min(remainder, multiple - remainder) <= tolerance;
}

function scoreRoundness(amountZec) {
  if (amountZec >= 1000 && withinMultiple(amountZec, 1000)) return 14;
  if (amountZec >= 500 && withinMultiple(amountZec, 500)) return 12;
  if (amountZec >= 100 && withinMultiple(amountZec, 100)) return 10;
  if (amountZec >= 50 && withinMultiple(amountZec, 50)) return 8;
  if (amountZec >= 10 && withinMultiple(amountZec, 10)) return 6;
  if (amountZec >= 1 && withinMultiple(amountZec, 1)) return 4;
  return 0;
}

function scoreAmountSimilarity(diffZat) {
  if (diffZat === 0) return 35;
  if (diffZat <= 10000) return 32;
  if (diffZat <= 50000) return 28;
  if (diffZat <= 100000) return 24;
  if (diffZat <= 250000) return 16;
  if (diffZat <= 500000) return 8;
  return 0;
}

function scoreTimeProximity(seconds) {
  if (seconds < 15 * 60) return 25;
  if (seconds < 60 * 60) return 20;
  if (seconds < 2 * 60 * 60) return 16;
  if (seconds < 6 * 60 * 60) return 12;
  if (seconds < 24 * 60 * 60) return 8;
  if (seconds < 3 * 24 * 60 * 60) return 5;
  if (seconds < 7 * 24 * 60 * 60) return 3;
  return 1;
}

function scoreAmountRarity(occurrences) {
  if (occurrences <= 1) return 24;
  if (occurrences <= 3) return 20;
  if (occurrences <= 10) return 15;
  if (occurrences <= 25) return 10;
  if (occurrences <= 100) return 4;
  return 0;
}

function scoreAmountWeirdness(amountZat, occurrences) {
  const amountZec = toZec(amountZat);
  const roundness = scoreRoundness(amountZec);

  if (occurrences <= 3 && roundness === 0) return 18;
  if (occurrences <= 10 && roundness === 0) return 12;
  if (occurrences <= 3) return 6;
  if (occurrences <= 10) return 2;
  return 0;
}

function scoreBatchSize(count) {
  if (count >= 12) return 28;
  if (count >= 8) return 24;
  if (count >= 5) return 18;
  if (count >= 3) return 12;
  return 0;
}

function scoreUniformity(amounts, representativeAmount) {
  if (amounts.length === 0) return 0;
  const maxDiff = amounts.reduce((max, amount) => Math.max(max, Math.abs(amount - representativeAmount)), 0);
  if (maxDiff === 0) return 14;
  if (maxDiff <= CONFIG.PAIR_TOLERANCE_ZAT / 2) return 12;
  if (maxDiff <= CONFIG.PAIR_TOLERANCE_ZAT) return 9;
  if (maxDiff <= CONFIG.PAIR_TOLERANCE_ZAT * 2) return 5;
  return 0;
}

function scoreBatchTimeSpan(seconds) {
  if (seconds < 60 * 60) return 15;
  if (seconds < 6 * 60 * 60) return 12;
  if (seconds < 24 * 60 * 60) return 8;
  if (seconds < 3 * 24 * 60 * 60) return 4;
  return 1;
}

function scoreRecipientCoherence(uniqueCount, memberCount, dominantRatio) {
  if (memberCount < 2) return 0;
  if (uniqueCount === 1 && memberCount >= 3) return 12;
  if (uniqueCount <= 2 && memberCount >= 5) return 10;
  if (dominantRatio >= 0.75) return 8;
  if (dominantRatio >= 0.5) return 5;
  return 0;
}

function scoreShieldConservation(totalAmountZat, shieldAmountZat) {
  const diff = Math.abs(totalAmountZat - shieldAmountZat);
  const diffPercent = shieldAmountZat > 0 ? (diff / shieldAmountZat) * 100 : 100;

  if (diff === 0) return 24;
  if (diff <= CONFIG.PAIR_TOLERANCE_ZAT) return 22;
  if (diffPercent <= 0.1) return 18;
  if (diffPercent <= 1) return 12;
  if (diffPercent <= 5) return 6;
  return 0;
}

function buildAmbiguityScore(candidateCount, margin) {
  const countPenalty = Math.max(0, candidateCount - 1) * 12;
  const marginPenalty = margin >= 12 ? 0 : margin >= 8 ? 8 : margin >= 4 ? 16 : 24;
  return clamp(countPenalty + marginPenalty, 0, 100);
}

async function getAmountFrequencyMap(pool, minTime, minAmountZat) {
  const { rows } = await pool.query(
    `
      SELECT amount_zat, COUNT(*)::int AS count
      FROM shielded_flows
      WHERE block_time > $1
        AND amount_zat >= $2
      GROUP BY amount_zat
    `,
    [minTime, minAmountZat]
  );

  const map = new Map();
  for (const row of rows) {
    map.set(Number(row.amount_zat), Number(row.count));
  }
  return map;
}

async function getTransparentAddresses(pool, txid, flowType) {
  if (flowType === 'shield') {
    const result = await pool.query(
      `
        SELECT DISTINCT address
        FROM transaction_inputs
        WHERE txid = $1
          AND address IS NOT NULL
      `,
      [txid]
    );
    return result.rows.map((row) => row.address);
  }

  const result = await pool.query(
    `
      SELECT DISTINCT address
      FROM transaction_outputs
      WHERE txid = $1
        AND address IS NOT NULL
    `,
    [txid]
  );
  return result.rows.map((row) => row.address);
}

async function getAddressMaps(pool, shieldTxids, deshieldTxids) {
  const shieldMap = new Map();
  const deshieldMap = new Map();

  if (shieldTxids.length > 0) {
    const { rows } = await pool.query(
      `
        SELECT txid, address
        FROM transaction_inputs
        WHERE txid = ANY($1::text[])
          AND address IS NOT NULL
      `,
      [shieldTxids]
    );

    for (const row of rows) {
      if (!shieldMap.has(row.txid)) shieldMap.set(row.txid, new Set());
      shieldMap.get(row.txid).add(row.address);
    }
  }

  if (deshieldTxids.length > 0) {
    const { rows } = await pool.query(
      `
        SELECT txid, address
        FROM transaction_outputs
        WHERE txid = ANY($1::text[])
          AND address IS NOT NULL
      `,
      [deshieldTxids]
    );

    for (const row of rows) {
      if (!deshieldMap.has(row.txid)) deshieldMap.set(row.txid, new Set());
      deshieldMap.get(row.txid).add(row.address);
    }
  }

  return {
    shield: new Map([...shieldMap.entries()].map(([txid, set]) => [txid, [...set]])),
    deshield: new Map([...deshieldMap.entries()].map(([txid, set]) => [txid, [...set]])),
  };
}

async function getBatchAddressStats(pool, txids) {
  if (txids.length === 0) {
    return {
      perTx: new Map(),
      uniqueAddresses: [],
      topAddresses: [],
      uniqueCount: 0,
      dominantRatio: 0,
    };
  }

  const { rows } = await pool.query(
    `
      SELECT txid, address
      FROM transaction_outputs
      WHERE txid = ANY($1::text[])
        AND address IS NOT NULL
    `,
    [txids]
  );

  const perTx = new Map();
  const frequency = new Map();

  for (const row of rows) {
    if (!perTx.has(row.txid)) perTx.set(row.txid, new Set());
    perTx.get(row.txid).add(row.address);
    frequency.set(row.address, (frequency.get(row.address) || 0) + 1);
  }

  const normalizedPerTx = new Map([...perTx.entries()].map(([txid, set]) => [txid, [...set]]));
  const rankedAddresses = [...frequency.entries()].sort((a, b) => b[1] - a[1]);
  const totalMentions = rankedAddresses.reduce((sum, [, count]) => sum + count, 0);
  const dominantRatio = totalMentions > 0 ? rankedAddresses[0][1] / totalMentions : 0;

  return {
    perTx: normalizedPerTx,
    uniqueAddresses: rankedAddresses.map(([address]) => address),
    topAddresses: rankedAddresses.slice(0, 5).map(([address]) => address),
    uniqueCount: rankedAddresses.length,
    dominantRatio,
  };
}

function buildPairEdgeObject(row, rank, candidateCount, margin, occurrences, addressMaps) {
  const amountDiffZat = Math.abs(Number(row.src_amount_zat) - Number(row.dst_amount_zat));
  const timeDeltaSeconds = Number(row.dst_block_time) - Number(row.src_block_time);
  const amountSimilarity = scoreAmountSimilarity(amountDiffZat);
  const timing = scoreTimeProximity(timeDeltaSeconds);
  const rarity = scoreAmountRarity(occurrences);
  const weirdAmount = scoreAmountWeirdness(Number(row.src_amount_zat), occurrences);
  const poolMatch = row.src_pool && row.dst_pool && row.src_pool === row.dst_pool ? 4 : 0;
  const baseScore = amountSimilarity + timing + rarity + weirdAmount + poolMatch;
  const ambiguityScore = buildAmbiguityScore(candidateCount, margin);
  const confidenceScore = clamp(Math.round(baseScore - ambiguityScore * 0.25), 0, 100);
  const shieldAddresses = addressMaps.shield.get(row.src_txid) || [];
  const deshieldAddresses = addressMaps.deshield.get(row.dst_txid) || [];

  return {
    edgeHash: generateHash(['PAIR_LINK', row.src_txid, row.dst_txid, String(rank)]),
    edgeType: 'PAIR_LINK',
    candidateRank: rank,
    srcTxid: row.src_txid,
    srcBlockHeight: Number(row.src_block_height),
    srcBlockTime: Number(row.src_block_time),
    srcAmountZat: Number(row.src_amount_zat),
    srcPool: row.src_pool,
    dstTxid: row.dst_txid,
    dstBlockHeight: Number(row.dst_block_height),
    dstBlockTime: Number(row.dst_block_time),
    dstAmountZat: Number(row.dst_amount_zat),
    dstPool: row.dst_pool,
    anchorTxid: null,
    amountDiffZat,
    timeDeltaSeconds,
    amountRarityScore: rarity,
    amountWeirdnessScore: weirdAmount,
    timingScore: timing,
    recipientReuseScore: 0,
    confidenceScore,
    confidenceMargin: Math.max(0, Math.round(margin)),
    ambiguityScore,
    warningLevel: getWarningLevel(confidenceScore),
    evidence: {
      srcAddresses: shieldAddresses,
      dstAddresses: deshieldAddresses,
      occurrences,
      breakdown: {
        amountSimilarity,
        timeProximity: timing,
        amountRarity: rarity,
        weirdAmount,
        poolMatch,
        ambiguityPenalty: Math.round(ambiguityScore * 0.25),
      },
    },
  };
}

async function computePrivacyLinkageEdges(pool, options = {}) {
  const {
    minAmountZat = CONFIG.MIN_AMOUNT_ZAT,
    timeWindowDays = CONFIG.PAIR_LOOKBACK_DAYS,
    toleranceZat = CONFIG.PAIR_TOLERANCE_ZAT,
    limit = CONFIG.MAX_PAIR_CANDIDATES,
    topCandidatesPerTx = CONFIG.MAX_EDGE_CANDIDATES_PER_TX,
    minConfidence = 35,
    specificTxid = null,
  } = options;

  const minTime = Math.floor(Date.now() / 1000) - timeWindowDays * 86400;
  const params = [minTime, minAmountZat, toleranceZat];
  let txFilterSql = '';

  if (specificTxid) {
    params.push(specificTxid);
    txFilterSql = `AND (s.txid = $4 OR d.txid = $4)`;
  }

  params.push(limit);

  const query = `
    WITH recent_shields AS (
      SELECT txid, block_height, block_time, amount_zat, pool
      FROM shielded_flows
      WHERE flow_type = 'shield'
        AND block_time > $1
        AND amount_zat >= $2
    ),
    recent_deshields AS (
      SELECT txid, block_height, block_time, amount_zat, pool
      FROM shielded_flows
      WHERE flow_type = 'deshield'
        AND block_time > $1
        AND amount_zat >= $2
    )
    SELECT
      s.txid AS src_txid,
      s.block_height AS src_block_height,
      s.block_time AS src_block_time,
      s.amount_zat AS src_amount_zat,
      s.pool AS src_pool,
      d.txid AS dst_txid,
      d.block_height AS dst_block_height,
      d.block_time AS dst_block_time,
      d.amount_zat AS dst_amount_zat,
      d.pool AS dst_pool
    FROM recent_shields s
    JOIN recent_deshields d
      ON d.block_time > s.block_time
     AND d.block_time < s.block_time + ${CONFIG.MAX_LINK_WINDOW_SECONDS}
     AND ABS(d.amount_zat - s.amount_zat) <= $3
    WHERE TRUE
      ${txFilterSql}
    ORDER BY d.block_time DESC
    LIMIT $${params.length}
  `;

  const [candidateResult, frequencyMap] = await Promise.all([
    pool.query(query, params),
    getAmountFrequencyMap(pool, minTime, minAmountZat),
  ]);

  if (candidateResult.rows.length === 0) return [];

  const shieldTxids = [...new Set(candidateResult.rows.map((row) => row.src_txid))];
  const deshieldTxids = [...new Set(candidateResult.rows.map((row) => row.dst_txid))];
  const addressMaps = await getAddressMaps(pool, shieldTxids, deshieldTxids);

  const groupedByDst = new Map();
  for (const row of candidateResult.rows) {
    const diff = Math.abs(Number(row.src_amount_zat) - Number(row.dst_amount_zat));
    const timeDeltaSeconds = Number(row.dst_block_time) - Number(row.src_block_time);
    const occurrences = frequencyMap.get(Number(row.src_amount_zat)) || 1;
    const preliminary = scoreAmountSimilarity(diff)
      + scoreTimeProximity(timeDeltaSeconds)
      + scoreAmountRarity(occurrences)
      + scoreAmountWeirdness(Number(row.src_amount_zat), occurrences)
      + (row.src_pool === row.dst_pool ? 4 : 0);
    const keyed = { ...row, preliminary, occurrences };
    if (!groupedByDst.has(row.dst_txid)) groupedByDst.set(row.dst_txid, []);
    groupedByDst.get(row.dst_txid).push(keyed);
  }

  const edges = [];
  for (const candidates of groupedByDst.values()) {
    candidates.sort((a, b) => b.preliminary - a.preliminary || b.src_block_time - a.src_block_time);
    const nextScore = candidates[1]?.preliminary ?? 0;

    candidates.slice(0, topCandidatesPerTx).forEach((candidate, index) => {
      const currentMargin = index === 0
        ? candidate.preliminary - nextScore
        : candidate.preliminary - (candidates[index + 1]?.preliminary ?? 0);
      const edge = buildPairEdgeObject(
        candidate,
        index + 1,
        candidates.length,
        currentMargin,
        candidate.occurrences,
        addressMaps
      );

      if (edge.confidenceScore >= minConfidence) {
        edges.push(edge);
      }
    });
  }

  return edges.sort((a, b) => b.confidenceScore - a.confidenceScore || b.dstBlockTime - a.dstBlockTime);
}

function buildClusterExplanation(cluster, breakdown, matchingShield) {
  const representative = toZec(cluster.representativeAmountZat);
  const total = toZec(cluster.totalAmountZat);
  let summary = `Detected ${cluster.memberCount} deshields around ${representative.toFixed(4)} ZEC (total ${total.toLocaleString()} ZEC)`;

  if (cluster.timeSpanSeconds < 24 * 60 * 60) {
    summary += ` within ${Math.max(1, Math.round(cluster.timeSpanSeconds / 3600))} hours. `;
  } else {
    summary += ` over ${Math.max(1, Math.round(cluster.timeSpanSeconds / 86400))} days. `;
  }

  if (matchingShield) {
    summary += `The summed amount closely matches shield ${matchingShield.txid.slice(0, 10)}..., which raises attribution confidence.`;
  } else {
    summary += `No clear source shield stands out, so this remains a suspicious but ambiguous split pattern.`;
  }

  if (breakdown.recipientCoherence.points > 0) {
    summary += ` Recipient reuse also suggests coordinated withdrawals.`;
  }

  return summary;
}

async function computePrivacyBatchClusters(pool, options = {}) {
  const {
    minAmountZat = 10 * ZATOSHI,
    timeWindowDays = CONFIG.BATCH_LOOKBACK_DAYS,
    minBatchCount = CONFIG.MIN_BATCH_COUNT,
    amountBucketToleranceZat = CONFIG.PAIR_TOLERANCE_ZAT,
    maxGapSeconds = CONFIG.MAX_BATCH_GAP_SECONDS,
    limit = CONFIG.MAX_BATCH_ROWS,
    minConfidence = 35,
  } = options;

  const minTime = Math.floor(Date.now() / 1000) - timeWindowDays * 86400;
  const frequencyMap = await getAmountFrequencyMap(pool, minTime, minAmountZat);
  const { rows } = await pool.query(
    `
      SELECT txid, block_height, block_time, amount_zat, pool
      FROM shielded_flows
      WHERE flow_type = 'deshield'
        AND block_time > $1
        AND amount_zat >= $2
      ORDER BY amount_zat ASC, block_time ASC
      LIMIT $3
    `,
    [minTime, minAmountZat, limit]
  );

  if (rows.length === 0) {
    return { clusters: [], derivedEdges: [] };
  }

  const buckets = new Map();
  for (const row of rows) {
    const bucketKey = Math.round(Number(row.amount_zat) / amountBucketToleranceZat);
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
    buckets.get(bucketKey).push({
      txid: row.txid,
      blockHeight: Number(row.block_height),
      blockTime: Number(row.block_time),
      amountZat: Number(row.amount_zat),
      pool: row.pool,
    });
  }

  const candidateWindows = [];
  for (const bucketRows of buckets.values()) {
    bucketRows.sort((a, b) => a.blockTime - b.blockTime);
    let current = [];

    for (const tx of bucketRows) {
      const previous = current[current.length - 1];
      if (!previous || tx.blockTime - previous.blockTime <= maxGapSeconds) {
        current.push(tx);
      } else {
        if (current.length >= minBatchCount) candidateWindows.push(current);
        current = [tx];
      }
    }

    if (current.length >= minBatchCount) candidateWindows.push(current);
  }

  const clusters = [];
  const derivedEdges = [];
  const seen = new Set();

  for (const members of candidateWindows) {
    const memberTxids = members.map((member) => member.txid);
    const clusterHash = generateHash(['BATCH_DESHIELD', ...memberTxids.slice().sort()]);
    if (seen.has(clusterHash)) continue;
    seen.add(clusterHash);

    const amounts = members.map((member) => member.amountZat);
    const times = members.map((member) => member.blockTime);
    const heights = members.map((member) => member.blockHeight);
    const representativeAmountZat = Math.round(amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length);
    const totalAmountZat = amounts.reduce((sum, amount) => sum + amount, 0);
    const firstTxTime = Math.min(...times);
    const lastTxTime = Math.max(...times);
    const timeSpanSeconds = lastTxTime - firstTxTime;
    const addressStats = await getBatchAddressStats(pool, memberTxids);

    const matchingShieldResult = await pool.query(
      `
        SELECT txid, block_height, block_time, amount_zat, pool
        FROM shielded_flows
        WHERE flow_type = 'shield'
          AND block_time < $1
          AND block_time > $1 - ${CONFIG.MAX_LINK_WINDOW_SECONDS}
          AND amount_zat BETWEEN $2 AND $3
        ORDER BY ABS(amount_zat - $4) ASC, block_time DESC
        LIMIT 5
      `,
      [
        firstTxTime,
        totalAmountZat - amountBucketToleranceZat * members.length,
        totalAmountZat + amountBucketToleranceZat * members.length,
        totalAmountZat,
      ]
    );

    const bestShield = matchingShieldResult.rows[0]
      ? {
          txid: matchingShieldResult.rows[0].txid,
          blockHeight: Number(matchingShieldResult.rows[0].block_height),
          blockTime: Number(matchingShieldResult.rows[0].block_time),
          amountZat: Number(matchingShieldResult.rows[0].amount_zat),
          pool: matchingShieldResult.rows[0].pool,
        }
      : null;

    const secondShield = matchingShieldResult.rows[1]
      ? Number(matchingShieldResult.rows[1].amount_zat)
      : null;

    const breakdown = {
      batchCount: {
        count: members.length,
        points: scoreBatchSize(members.length),
      },
      uniformity: {
        representativeAmountZat,
        points: scoreUniformity(amounts, representativeAmountZat),
      },
      timeClustering: {
        hours: Number((timeSpanSeconds / 3600).toFixed(1)),
        points: scoreBatchTimeSpan(timeSpanSeconds),
      },
      amountFingerprint: {
        occurrences: frequencyMap.get(representativeAmountZat) || members.length,
        weirdPoints: scoreAmountWeirdness(representativeAmountZat, frequencyMap.get(representativeAmountZat) || members.length),
        roundPoints: scoreRoundness(toZec(representativeAmountZat)),
      },
      recipientCoherence: {
        uniqueAddresses: addressStats.uniqueCount,
        dominantRatio: Number(addressStats.dominantRatio.toFixed(2)),
        points: scoreRecipientCoherence(addressStats.uniqueCount, members.length, addressStats.dominantRatio),
      },
      matchingShield: {
        found: !!bestShield,
        points: bestShield ? scoreShieldConservation(totalAmountZat, bestShield.amountZat) : 0,
      },
    };

    const preliminaryScore = breakdown.batchCount.points
      + breakdown.uniformity.points
      + breakdown.timeClustering.points
      + breakdown.amountFingerprint.weirdPoints
      + breakdown.recipientCoherence.points
      + breakdown.matchingShield.points;

    const conservationMargin = bestShield
      ? Math.abs(totalAmountZat - (secondShield || totalAmountZat)) / ZATOSHI
      : 0;
    const ambiguityScore = buildAmbiguityScore(matchingShieldResult.rows.length || 1, conservationMargin * 2);
    const confidenceScore = clamp(Math.round(preliminaryScore - ambiguityScore * 0.2), 0, 100);
    if (confidenceScore < minConfidence) continue;

    const explanation = buildClusterExplanation(
      {
        memberCount: members.length,
        representativeAmountZat,
        totalAmountZat,
        timeSpanSeconds,
      },
      breakdown,
      bestShield
    );

    const cluster = {
      clusterHash,
      clusterType: 'BATCH_DESHIELD',
      anchorTxid: bestShield?.txid || null,
      anchorBlockHeight: bestShield?.blockHeight || null,
      anchorBlockTime: bestShield?.blockTime || null,
      anchorAmountZat: bestShield?.amountZat || null,
      memberTxids,
      memberCount: members.length,
      totalAmountZat,
      representativeAmountZat,
      firstTxTime,
      lastTxTime,
      timeSpanSeconds,
      confidenceScore,
      confidenceMargin: Math.max(0, Math.round(conservationMargin)),
      ambiguityScore,
      warningLevel: getWarningLevel(confidenceScore),
      evidence: {
        txids: memberTxids,
        heights,
        times,
        addresses: addressStats.uniqueAddresses,
        addressCount: addressStats.uniqueCount,
        sameAddressRatio: Math.round(addressStats.dominantRatio * 100),
        topAddresses: addressStats.topAddresses,
        perTxRecipientMap: Object.fromEntries(addressStats.perTx),
        breakdown,
        explanation,
        matchingShield: bestShield
          ? {
              txid: bestShield.txid,
              blockHeight: bestShield.blockHeight,
              blockTime: bestShield.blockTime,
              amountZec: toZec(bestShield.amountZat),
            }
          : null,
      },
    };

    clusters.push(cluster);

    if (bestShield) {
      const shieldAddresses = await getTransparentAddresses(pool, bestShield.txid, 'shield');
      for (const member of members) {
        const recipientAddresses = addressStats.perTx.get(member.txid) || [];
        const edgeScore = clamp(Math.round(confidenceScore - 5), 0, 100);
        derivedEdges.push({
          edgeHash: generateHash(['BATCH_LINK', bestShield.txid, member.txid, clusterHash]),
          edgeType: 'BATCH_LINK',
          candidateRank: 1,
          srcTxid: bestShield.txid,
          srcBlockHeight: bestShield.blockHeight,
          srcBlockTime: bestShield.blockTime,
          srcAmountZat: bestShield.amountZat,
          srcPool: bestShield.pool,
          dstTxid: member.txid,
          dstBlockHeight: member.blockHeight,
          dstBlockTime: member.blockTime,
          dstAmountZat: member.amountZat,
          dstPool: member.pool,
          anchorTxid: bestShield.txid,
          amountDiffZat: Math.abs(totalAmountZat - bestShield.amountZat),
          timeDeltaSeconds: member.blockTime - bestShield.blockTime,
          amountRarityScore: breakdown.amountFingerprint.occurrences,
          amountWeirdnessScore: breakdown.amountFingerprint.weirdPoints,
          timingScore: breakdown.timeClustering.points,
          recipientReuseScore: breakdown.recipientCoherence.points,
          confidenceScore: edgeScore,
          confidenceMargin: cluster.confidenceMargin,
          ambiguityScore,
          warningLevel: getWarningLevel(edgeScore),
          evidence: {
            clusterHash,
            clusterType: 'BATCH_DESHIELD',
            srcAddresses: shieldAddresses,
            dstAddresses: recipientAddresses,
            clusterMemberCount: members.length,
            explanation,
          },
        });
      }
    }
  }

  clusters.sort((a, b) => b.confidenceScore - a.confidenceScore || b.firstTxTime - a.firstTxTime);
  derivedEdges.sort((a, b) => b.confidenceScore - a.confidenceScore || b.dstBlockTime - a.dstBlockTime);
  return { clusters, derivedEdges };
}

async function upsertPrivacyLinkageEdges(pool, edges) {
  for (const edge of edges) {
    await pool.query(
      `
        INSERT INTO privacy_linkage_edges (
          edge_hash,
          edge_type,
          candidate_rank,
          src_txid,
          src_block_height,
          src_block_time,
          src_amount_zat,
          src_pool,
          dst_txid,
          dst_block_height,
          dst_block_time,
          dst_amount_zat,
          dst_pool,
          anchor_txid,
          amount_diff_zat,
          time_delta_seconds,
          amount_rarity_score,
          amount_weirdness_score,
          timing_score,
          recipient_reuse_score,
          confidence_score,
          confidence_margin,
          ambiguity_score,
          warning_level,
          evidence,
          expires_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
          $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25,
          NOW() + INTERVAL '90 days'
        )
        ON CONFLICT (edge_hash) DO UPDATE SET
          candidate_rank = EXCLUDED.candidate_rank,
          amount_diff_zat = EXCLUDED.amount_diff_zat,
          time_delta_seconds = EXCLUDED.time_delta_seconds,
          amount_rarity_score = EXCLUDED.amount_rarity_score,
          amount_weirdness_score = EXCLUDED.amount_weirdness_score,
          timing_score = EXCLUDED.timing_score,
          recipient_reuse_score = EXCLUDED.recipient_reuse_score,
          confidence_score = EXCLUDED.confidence_score,
          confidence_margin = EXCLUDED.confidence_margin,
          ambiguity_score = EXCLUDED.ambiguity_score,
          warning_level = EXCLUDED.warning_level,
          evidence = EXCLUDED.evidence,
          updated_at = NOW(),
          expires_at = NOW() + INTERVAL '90 days'
      `,
      [
        edge.edgeHash,
        edge.edgeType,
        edge.candidateRank,
        edge.srcTxid,
        edge.srcBlockHeight,
        edge.srcBlockTime,
        edge.srcAmountZat,
        edge.srcPool,
        edge.dstTxid,
        edge.dstBlockHeight,
        edge.dstBlockTime,
        edge.dstAmountZat,
        edge.dstPool,
        edge.anchorTxid,
        edge.amountDiffZat,
        edge.timeDeltaSeconds,
        edge.amountRarityScore,
        edge.amountWeirdnessScore,
        edge.timingScore,
        edge.recipientReuseScore,
        edge.confidenceScore,
        edge.confidenceMargin,
        edge.ambiguityScore,
        edge.warningLevel,
        JSON.stringify(edge.evidence),
      ]
    );
  }
}

async function upsertPrivacyBatchClusters(pool, clusters) {
  for (const cluster of clusters) {
    await pool.query(
      `
        INSERT INTO privacy_batch_clusters (
          cluster_hash,
          cluster_type,
          anchor_txid,
          anchor_block_height,
          anchor_block_time,
          anchor_amount_zat,
          member_txids,
          member_count,
          total_amount_zat,
          representative_amount_zat,
          first_tx_time,
          last_tx_time,
          time_span_seconds,
          confidence_score,
          confidence_margin,
          ambiguity_score,
          warning_level,
          evidence,
          expires_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18,
          NOW() + INTERVAL '90 days'
        )
        ON CONFLICT (cluster_hash) DO UPDATE SET
          anchor_txid = EXCLUDED.anchor_txid,
          anchor_block_height = EXCLUDED.anchor_block_height,
          anchor_block_time = EXCLUDED.anchor_block_time,
          anchor_amount_zat = EXCLUDED.anchor_amount_zat,
          member_txids = EXCLUDED.member_txids,
          member_count = EXCLUDED.member_count,
          total_amount_zat = EXCLUDED.total_amount_zat,
          representative_amount_zat = EXCLUDED.representative_amount_zat,
          first_tx_time = EXCLUDED.first_tx_time,
          last_tx_time = EXCLUDED.last_tx_time,
          time_span_seconds = EXCLUDED.time_span_seconds,
          confidence_score = EXCLUDED.confidence_score,
          confidence_margin = EXCLUDED.confidence_margin,
          ambiguity_score = EXCLUDED.ambiguity_score,
          warning_level = EXCLUDED.warning_level,
          evidence = EXCLUDED.evidence,
          updated_at = NOW(),
          expires_at = NOW() + INTERVAL '90 days'
      `,
      [
        cluster.clusterHash,
        cluster.clusterType,
        cluster.anchorTxid,
        cluster.anchorBlockHeight,
        cluster.anchorBlockTime,
        cluster.anchorAmountZat,
        cluster.memberTxids,
        cluster.memberCount,
        cluster.totalAmountZat,
        cluster.representativeAmountZat,
        cluster.firstTxTime,
        cluster.lastTxTime,
        cluster.timeSpanSeconds,
        cluster.confidenceScore,
        cluster.confidenceMargin,
        cluster.ambiguityScore,
        cluster.warningLevel,
        JSON.stringify(cluster.evidence),
      ]
    );
  }
}

function mapEdgeRowToRisk(row) {
  const evidence = row.evidence || {};
  const breakdown = evidence.breakdown || {};

  return {
    shieldTxid: row.src_txid,
    shieldHeight: Number(row.src_block_height),
    shieldTime: Number(row.src_block_time),
    shieldAmount: toZec(row.src_amount_zat),
    shieldPool: row.src_pool,
    shieldAddresses: evidence.srcAddresses || [],
    deshieldTxid: row.dst_txid,
    deshieldHeight: Number(row.dst_block_height),
    deshieldTime: Number(row.dst_block_time),
    deshieldAmount: toZec(row.dst_amount_zat),
    deshieldPool: row.dst_pool,
    deshieldAddresses: evidence.dstAddresses || [],
    timeDelta: formatTimeDelta(Number(row.time_delta_seconds)),
    timeDeltaSeconds: Number(row.time_delta_seconds),
    score: Number(row.confidence_score),
    warningLevel: row.warning_level,
    ambiguityScore: Number(row.ambiguity_score),
    confidenceMargin: Number(row.confidence_margin),
    scoreBreakdown: {
      amountSimilarity: Number(breakdown.amountSimilarity || 0),
      timeProximity: Number(breakdown.timeProximity || 0),
      amountRarity: Number(breakdown.amountRarity || 0),
      weirdAmount: Number(breakdown.weirdAmount || 0),
    },
  };
}

function mapClusterRowToPattern(row) {
  const evidence = row.evidence || {};
  const breakdown = evidence.breakdown || {};
  const matchingShield = evidence.matchingShield || null;

  return {
    patternType: row.cluster_type,
    clusterHash: row.cluster_hash,
    perTxAmountZec: toZec(row.representative_amount_zat),
    batchCount: Number(row.member_count),
    totalAmountZec: toZec(row.total_amount_zat),
    txids: evidence.txids || row.member_txids || [],
    heights: evidence.heights || [],
    times: evidence.times || [],
    addresses: evidence.addresses || [],
    addressCount: Number(evidence.addressCount || 0),
    sameAddressRatio: Number(evidence.sameAddressRatio || 0),
    firstTime: Number(row.first_tx_time),
    lastTime: Number(row.last_tx_time),
    timeSpanHours: Number((Number(row.time_span_seconds) / 3600).toFixed(1)),
    isRoundNumber: scoreRoundness(toZec(row.representative_amount_zat)) > 0,
    matchingShield,
    score: Number(row.confidence_score),
    warningLevel: row.warning_level,
    ambiguityScore: Number(row.ambiguity_score),
    confidenceMargin: Number(row.confidence_margin),
    explanation: evidence.explanation || 'Suspicious batch cluster detected.',
    breakdown: {
      batchCount: breakdown.batchCount || { count: Number(row.member_count), points: 0 },
      roundNumber: {
        amountZec: toZec(row.representative_amount_zat),
        isRound: scoreRoundness(toZec(row.representative_amount_zat)) > 0,
        points: breakdown.amountFingerprint?.roundPoints || 0,
      },
      matchingShield: {
        found: Boolean(matchingShield),
        txid: matchingShield?.txid || null,
        points: breakdown.matchingShield?.points || 0,
      },
      timeClustering: breakdown.timeClustering || { hours: Number((Number(row.time_span_seconds) / 3600).toFixed(1)), points: 0 },
      addressAnalysis: {
        totalAddresses: Number(evidence.addressCount || 0),
        uniqueAddresses: Number(evidence.addressCount || 0),
        sameAddressRatio: Number(evidence.sameAddressRatio || 0),
        topAddresses: evidence.topAddresses || [],
        points: breakdown.recipientCoherence?.points || 0,
      },
      shieldTiming: {
        hoursAfterShield: matchingShield
          ? Number(((Number(row.first_tx_time) - Number(matchingShield.blockTime)) / 3600).toFixed(1))
          : null,
        points: breakdown.matchingShield?.points || 0,
      },
    },
  };
}

async function queryPrivacyLinkageEdges(pool, options = {}) {
  const {
    limit = 20,
    offset = 0,
    period = '7d',
    riskLevel = 'ALL',
    minScore = 40,
    sort = 'recent',
    txid = null,
  } = options;

  const periodMap = {
    '24h': 24 * 3600,
    '7d': 7 * 24 * 3600,
    '30d': 30 * 24 * 3600,
    '90d': 90 * 24 * 3600,
  };
  const minTime = Math.floor(Date.now() / 1000) - (periodMap[period] || periodMap['7d']);
  const params = [minTime, minScore];
  const clauses = [
    `edge_type = 'PAIR_LINK'`,
    `candidate_rank = 1`,
    `expires_at > NOW()`,
    `dst_block_time > $1`,
    `confidence_score >= $2`,
  ];

  if (riskLevel !== 'ALL') {
    params.push(riskLevel);
    clauses.push(`warning_level = $${params.length}`);
  }

  if (txid) {
    params.push(txid);
    clauses.push(`(src_txid = $${params.length} OR dst_txid = $${params.length})`);
  }

  const orderBy = sort === 'score'
    ? 'confidence_score DESC, dst_block_time DESC'
    : 'dst_block_time DESC, confidence_score DESC';

  params.push(limit, offset);

  const query = `
    SELECT *
    FROM privacy_linkage_edges
    WHERE ${clauses.join(' AND ')}
    ORDER BY ${orderBy}
    LIMIT $${params.length - 1}
    OFFSET $${params.length}
  `;

  const countQuery = `
    SELECT COUNT(*)::int AS total
    FROM privacy_linkage_edges
    WHERE ${clauses.join(' AND ')}
  `;

  const [result, countResult] = await Promise.all([
    pool.query(query, params),
    pool.query(countQuery, params.slice(0, -2)),
  ]);

  const transactions = result.rows.map(mapEdgeRowToRisk);
  return {
    transactions,
    pagination: {
      total: Number(countResult.rows[0]?.total || 0),
      limit,
      offset,
      returned: transactions.length,
      hasMore: offset + transactions.length < Number(countResult.rows[0]?.total || 0),
    },
  };
}

async function queryPrivacyBatchClusters(pool, options = {}) {
  const {
    limit = 20,
    period = '30d',
    riskLevel = 'ALL',
    sort = 'score',
    afterScore = null,
    afterAmount = null,
    minScore = 35,
  } = options;

  const periodMap = {
    '7d': 7 * 24 * 3600,
    '30d': 30 * 24 * 3600,
    '90d': 90 * 24 * 3600,
  };
  const minTime = Math.floor(Date.now() / 1000) - (periodMap[period] || periodMap['30d']);
  const filterParams = [minTime, minScore];
  const clauses = [
    `expires_at > NOW()`,
    `first_tx_time > $1`,
    `confidence_score >= $2`,
  ];

  if (riskLevel !== 'ALL') {
    filterParams.push(riskLevel);
    clauses.push(`warning_level = $${filterParams.length}`);
  }

  let cursorClause = '';
  const params = [...filterParams];
  if (sort === 'score' && afterScore !== null && afterAmount !== null) {
    params.push(afterScore, Math.round(afterAmount * ZATOSHI));
    cursorClause = `AND (confidence_score < $${params.length - 1} OR (confidence_score = $${params.length - 1} AND representative_amount_zat < $${params.length}))`;
  } else if (sort === 'recent' && afterScore !== null) {
    params.push(afterScore);
    cursorClause = `AND first_tx_time < $${params.length}`;
  }

  params.push(limit + 1);

  const orderBy = sort === 'score'
    ? 'confidence_score DESC, representative_amount_zat DESC'
    : 'first_tx_time DESC, confidence_score DESC';

  const query = `
    SELECT *
    FROM privacy_batch_clusters
    WHERE ${clauses.join(' AND ')}
      ${cursorClause}
    ORDER BY ${orderBy}
    LIMIT $${params.length}
  `;

  const countQuery = `
    SELECT COUNT(*)::int AS total
    FROM privacy_batch_clusters
    WHERE ${clauses.join(' AND ')}
  `;

  const [result, countResult] = await Promise.all([
    pool.query(query, params),
    pool.query(countQuery, filterParams),
  ]);

  const hasMore = result.rows.length > limit;
  const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
  const patterns = rows.map(mapClusterRowToPattern);
  const lastPattern = patterns[patterns.length - 1];

  return {
    patterns,
    pagination: {
      total: Number(countResult.rows[0]?.total || 0),
      returned: patterns.length,
      hasMore,
      nextCursor: hasMore && lastPattern
        ? sort === 'score'
          ? { score: lastPattern.score, amount: lastPattern.perTxAmountZec }
          : { time: lastPattern.firstTime }
        : null,
    },
  };
}

async function findLinkedTransactions(pool, txid, options = {}) {
  const txResult = await pool.query(
    `
      SELECT txid, block_height, block_time, flow_type, amount_zat, pool,
             transparent_addresses, transparent_value_zat
      FROM shielded_flows
      WHERE txid = $1
    `,
    [txid]
  );

  if (txResult.rows.length === 0) {
    const txCheck = await pool.query('SELECT txid FROM transactions WHERE txid = $1', [txid]);
    if (txCheck.rows.length === 0) {
      return { error: 'Transaction not found', code: 'TX_NOT_FOUND' };
    }
    return {
      txid,
      flowType: null,
      hasShieldedActivity: false,
      linkedTransactions: [],
      message: 'This transaction has no shielding or deshielding activity',
    };
  }

  const tx = txResult.rows[0];
  const flowType = tx.flow_type;
  const limit = options.limit || 5;

  let edges = [];
  try {
    const edgeQuery = flowType === 'shield'
      ? `
          SELECT *
          FROM privacy_linkage_edges
          WHERE src_txid = $1
            AND edge_type = 'PAIR_LINK'
            AND expires_at > NOW()
          ORDER BY confidence_score DESC, dst_block_time DESC
          LIMIT $2
        `
      : `
          SELECT *
          FROM privacy_linkage_edges
          WHERE dst_txid = $1
            AND edge_type = 'PAIR_LINK'
            AND expires_at > NOW()
          ORDER BY confidence_score DESC, src_block_time DESC
          LIMIT $2
        `;
    const edgeResult = await pool.query(edgeQuery, [txid, limit]);
    edges = edgeResult.rows;
  } catch (error) {
    if (error.code !== '42P01') throw error;
  }

  if (edges.length === 0) {
    const computed = await computePrivacyLinkageEdges(pool, {
      specificTxid: txid,
      limit: 100,
      topCandidatesPerTx: limit,
    });
    edges = computed
      .filter((edge) => edge.srcTxid === txid || edge.dstTxid === txid)
      .slice(0, limit)
      .map((edge) => ({
        src_txid: edge.srcTxid,
        src_block_height: edge.srcBlockHeight,
        src_block_time: edge.srcBlockTime,
        src_amount_zat: edge.srcAmountZat,
        src_pool: edge.srcPool,
        dst_txid: edge.dstTxid,
        dst_block_height: edge.dstBlockHeight,
        dst_block_time: edge.dstBlockTime,
        dst_amount_zat: edge.dstAmountZat,
        dst_pool: edge.dstPool,
        time_delta_seconds: edge.timeDeltaSeconds,
        confidence_score: edge.confidenceScore,
        warning_level: edge.warningLevel,
        ambiguity_score: edge.ambiguityScore,
        confidence_margin: edge.confidenceMargin,
        evidence: edge.evidence,
      }));
  }

  const linkedTransactions = edges.map((row) => {
    const isShield = flowType === 'shield';
    const linkedTxid = isShield ? row.dst_txid : row.src_txid;
    const linkedFlowType = isShield ? 'deshield' : 'shield';
    const linkedAmountZat = isShield ? Number(row.dst_amount_zat) : Number(row.src_amount_zat);
    const linkedBlockTime = isShield ? Number(row.dst_block_time) : Number(row.src_block_time);
    const evidence = row.evidence || {};
    return {
      txid: linkedTxid,
      flowType: linkedFlowType,
      amount: toZec(linkedAmountZat),
      amountZat: linkedAmountZat,
      blockHeight: isShield ? Number(row.dst_block_height) : Number(row.src_block_height),
      blockTime: linkedBlockTime,
      pool: isShield ? row.dst_pool : row.src_pool,
      timeDelta: formatTimeDelta(isShield ? Number(row.time_delta_seconds) : -Number(row.time_delta_seconds)),
      timeDeltaSeconds: isShield ? Number(row.time_delta_seconds) : -Number(row.time_delta_seconds),
      linkabilityScore: Number(row.confidence_score),
      warningLevel: row.warning_level,
      ambiguityScore: Number(row.ambiguity_score),
      confidenceMargin: Number(row.confidence_margin),
      transparentAddresses: isShield ? (evidence.dstAddresses || []) : (evidence.srcAddresses || []),
      scoreBreakdown: evidence.breakdown || {},
    };
  });

  const highestScore = linkedTransactions[0]?.linkabilityScore || 0;
  const transparentAddresses = await getTransparentAddresses(pool, txid, flowType);

  return {
    txid,
    flowType,
    amount: toZec(tx.amount_zat),
    amountZat: Number(tx.amount_zat),
    blockHeight: Number(tx.block_height),
    blockTime: Number(tx.block_time),
    pool: tx.pool,
    hasShieldedActivity: true,
    transparentAddresses,
    linkedTransactions,
    totalMatches: linkedTransactions.length,
    warningLevel: getWarningLevel(highestScore),
    highestScore,
    algorithm: {
      version: '2.0',
      note: 'Scores combine amount similarity, timing, amount rarity, weird-amount detection, and ambiguity penalties.',
    },
  };
}

async function detectBatchDeshields(pool, options = {}) {
  try {
    const result = await queryPrivacyBatchClusters(pool, {
      limit: options.limit || 50,
      period: `${options.timeWindowDays || 30}d`,
      riskLevel: 'ALL',
      sort: 'score',
      minScore: options.minScore || 35,
    });
    if (result.patterns.length > 0) return result.patterns;
  } catch (error) {
    if (error.code !== '42P01') throw error;
  }

  const { clusters } = await computePrivacyBatchClusters(pool, options);
  return clusters.map((cluster) =>
    mapClusterRowToPattern({
      cluster_hash: cluster.clusterHash,
      cluster_type: cluster.clusterType,
      anchor_txid: cluster.anchorTxid,
      member_txids: cluster.memberTxids,
      member_count: cluster.memberCount,
      total_amount_zat: cluster.totalAmountZat,
      representative_amount_zat: cluster.representativeAmountZat,
      first_tx_time: cluster.firstTxTime,
      last_tx_time: cluster.lastTxTime,
      time_span_seconds: cluster.timeSpanSeconds,
      confidence_score: cluster.confidenceScore,
      confidence_margin: cluster.confidenceMargin,
      ambiguity_score: cluster.ambiguityScore,
      warning_level: cluster.warningLevel,
      evidence: cluster.evidence,
    })
  );
}

async function detectBatchForShield(pool, shieldTxid) {
  let clusterRows = [];
  try {
    const result = await pool.query(
      `
        SELECT *
        FROM privacy_batch_clusters
        WHERE anchor_txid = $1
          AND expires_at > NOW()
        ORDER BY confidence_score DESC, first_tx_time DESC
      `,
      [shieldTxid]
    );
    clusterRows = result.rows;
  } catch (error) {
    if (error.code !== '42P01') throw error;
  }

  const shieldResult = await pool.query(
    `
      SELECT txid, amount_zat, block_time, block_height
      FROM shielded_flows
      WHERE txid = $1
        AND flow_type = 'shield'
    `,
    [shieldTxid]
  );

  if (shieldResult.rows.length === 0) {
    return { error: 'Shield transaction not found', txid: shieldTxid };
  }

  const shield = shieldResult.rows[0];
  const patterns = clusterRows.map(mapClusterRowToPattern);

  return {
    shieldTxid,
    shieldAmountZec: toZec(shield.amount_zat),
    shieldBlockHeight: Number(shield.block_height),
    shieldBlockTime: Number(shield.block_time),
    potentialBatchWithdrawals: patterns,
    hasBatchPattern: patterns.length > 0,
    warningLevel: patterns[0]?.warningLevel || 'NONE',
  };
}

async function getPrivacyGraph(pool, txid) {
  const edgeResult = await pool.query(
    `
      SELECT *
      FROM privacy_linkage_edges
      WHERE expires_at > NOW()
        AND (src_txid = $1 OR dst_txid = $1 OR anchor_txid = $1)
      ORDER BY confidence_score DESC, detected_at DESC
      LIMIT 50
    `,
    [txid]
  );

  const clusterResult = await pool.query(
    `
      SELECT *
      FROM privacy_batch_clusters
      WHERE expires_at > NOW()
        AND (anchor_txid = $1 OR $1 = ANY(member_txids))
      ORDER BY confidence_score DESC, detected_at DESC
      LIMIT 20
    `,
    [txid]
  );

  const txNodes = new Map();
  const addressNodes = new Map();
  const graphEdges = [];

  const ensureTxNode = (nodeTxid, label, extra = {}) => {
    if (!txNodes.has(nodeTxid)) {
      txNodes.set(nodeTxid, {
        id: nodeTxid,
        type: 'transaction',
        label,
        ...extra,
      });
    }
  };

  const ensureAddressNode = (address) => {
    if (!addressNodes.has(address)) {
      addressNodes.set(address, {
        id: `address:${address}`,
        type: 'address',
        label: `${address.slice(0, 12)}...${address.slice(-8)}`,
        address,
      });
    }
  };

  for (const row of edgeResult.rows) {
    const evidence = row.evidence || {};
    ensureTxNode(row.src_txid, row.edge_type === 'PAIR_LINK' ? 'Shield' : 'Anchor Shield', {
      amountZec: toZec(row.src_amount_zat),
      blockTime: Number(row.src_block_time),
      pool: row.src_pool,
    });
    ensureTxNode(row.dst_txid, row.edge_type === 'PAIR_LINK' ? 'Deshield' : 'Batch Member', {
      amountZec: toZec(row.dst_amount_zat),
      blockTime: Number(row.dst_block_time),
      pool: row.dst_pool,
    });

    for (const address of evidence.srcAddresses || []) {
      ensureAddressNode(address);
      graphEdges.push({
        id: generateHash(['ADDR_SRC', address, row.src_txid]),
        source: `address:${address}`,
        target: row.src_txid,
        type: 'transparent_input',
        confidence: Number(row.confidence_score),
      });
    }

    for (const address of evidence.dstAddresses || []) {
      ensureAddressNode(address);
      graphEdges.push({
        id: generateHash(['ADDR_DST', row.dst_txid, address]),
        source: row.dst_txid,
        target: `address:${address}`,
        type: 'transparent_output',
        confidence: Number(row.confidence_score),
      });
    }

    graphEdges.push({
      id: row.edge_hash,
      source: row.src_txid,
      target: row.dst_txid,
      type: row.edge_type,
      confidence: Number(row.confidence_score),
      ambiguityScore: Number(row.ambiguity_score),
      label: row.edge_type === 'PAIR_LINK'
        ? `${toZec(row.src_amount_zat).toFixed(4)} -> ${toZec(row.dst_amount_zat).toFixed(4)}`
        : `Batch member (${toZec(row.dst_amount_zat).toFixed(4)} ZEC)`,
    });
  }

  const clusters = clusterResult.rows.map(mapClusterRowToPattern);

  return {
    txid,
    nodes: [...txNodes.values(), ...addressNodes.values()],
    edges: graphEdges,
    clusters,
  };
}

module.exports = {
  CONFIG,
  formatTimeDelta,
  getTransparentAddresses,
  computePrivacyLinkageEdges,
  computePrivacyBatchClusters,
  upsertPrivacyLinkageEdges,
  upsertPrivacyBatchClusters,
  queryPrivacyLinkageEdges,
  queryPrivacyBatchClusters,
  findLinkedTransactions,
  detectBatchDeshields,
  detectBatchForShield,
  getPrivacyGraph,
};
