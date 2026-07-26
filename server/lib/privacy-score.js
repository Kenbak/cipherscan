/**
 * Network Privacy Score (v2)
 *
 * Calculated by the hourly update-privacy-stats job — NOT by cipherscan-rust.
 * The Rust indexer stores per-tx privacy_score on transactions (planned/future);
 * this module is the network-wide composite for privacy_stats / privacy_trends_daily.
 *
 * Weights (max points):
 *   Usage   35 — 30-day shielded tx share (non-coinbase)
 *   Quality 35 — fully-shielded / shielded tx share (30-day)
 *   Depth   15 — % of chain supply in shielded pools
 *   Hygiene 15 — turnstile reshield rate (90-day deshielded ZEC that gets reshielded)
 */

const WEIGHTS = {
  usage: 35,
  quality: 35,
  depth: 15,
  hygiene: 15,
};

function clampScore(value, max) {
  return Math.min(Math.max(value, 0), max);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

/**
 * @param {object} params
 * @param {number} params.recentShieldedPercent - 30d shielded tx % (non-coinbase denom)
 * @param {number} params.recentFullyShieldedPercent - 30d fully-shielded / shielded tx %
 * @param {number} params.supplyShieldedPercent - shielded pool / chain supply %
 * @param {number} params.reshieldPercent - 90d reshielded / deshielded ZEC %
 */
function calculatePrivacyScore(params) {
  const {
    recentShieldedPercent = 0,
    recentFullyShieldedPercent = 0,
    supplyShieldedPercent = 0,
    reshieldPercent = 0,
  } = params;

  const usageScore = clampScore(recentShieldedPercent * (WEIGHTS.usage / 100), WEIGHTS.usage);
  const qualityScore = clampScore(recentFullyShieldedPercent * (WEIGHTS.quality / 100), WEIGHTS.quality);
  const depthScore = clampScore(supplyShieldedPercent * (WEIGHTS.depth / 100), WEIGHTS.depth);
  const hygieneScore = clampScore(reshieldPercent * (WEIGHTS.hygiene / 100), WEIGHTS.hygiene);

  const total = Math.min(Math.round(usageScore + qualityScore + depthScore + hygieneScore), 100);

  return {
    total,
    version: 2,
    breakdown: {
      usage: {
        label: 'Usage',
        score: round1(usageScore),
        max: WEIGHTS.usage,
        percent: round1(recentShieldedPercent),
        detail: '30-day shielded tx share',
      },
      quality: {
        label: 'Quality',
        score: round1(qualityScore),
        max: WEIGHTS.quality,
        percent: round1(recentFullyShieldedPercent),
        detail: 'Fully shielded among shielded txs (30d)',
      },
      depth: {
        label: 'Depth',
        score: round1(depthScore),
        max: WEIGHTS.depth,
        percent: round1(supplyShieldedPercent),
        detail: 'Supply in shielded pools',
      },
      hygiene: {
        label: 'Hygiene',
        score: round1(hygieneScore),
        max: WEIGHTS.hygiene,
        percent: round1(reshieldPercent),
        detail: 'Deshielded ZEC reshielded (90d)',
      },
    },
  };
}

/**
 * Fetch rolling inputs for v2 score calculation.
 */
async function fetchPrivacyScoreInputs(pool) {
  const tx30d = (await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE has_sapling OR has_orchard OR has_ironwood) AS shielded,
      COUNT(*) FILTER (
        WHERE NOT is_coinbase
          AND NOT has_sapling AND NOT has_orchard AND NOT has_ironwood
      ) AS transparent,
      COUNT(*) FILTER (
        WHERE (has_sapling OR has_orchard OR has_ironwood)
          AND vin_count = 0 AND vout_count = 0
          AND NOT is_coinbase
      ) AS fully_shielded
    FROM transactions
    WHERE block_height > 0
      AND block_time >= EXTRACT(EPOCH FROM NOW() - INTERVAL '30 days')
  `)).rows[0];

  const shielded30d = parseInt(tx30d.shielded, 10) || 0;
  const transparent30d = parseInt(tx30d.transparent, 10) || 0;
  const fullyShielded30d = parseInt(tx30d.fully_shielded, 10) || 0;
  const denom30d = shielded30d + transparent30d;

  let reshieldPercent = 0;
  try {
    const turnstile = (await pool.query(`
      SELECT
        COALESCE(SUM(deshielded_zat), 0) AS deshielded,
        COALESCE(SUM(reshielded_zat), 0) AS reshielded
      FROM turnstile_daily
      WHERE date >= (CURRENT_DATE - INTERVAL '90 days')
    `)).rows[0];
    const deshielded = Number(turnstile.deshielded) || 0;
    const reshielded = Number(turnstile.reshielded) || 0;
    reshieldPercent = deshielded > 0 ? (reshielded / deshielded) * 100 : 0;
  } catch {
    reshieldPercent = 0;
  }

  return {
    recentShieldedPercent: denom30d > 0 ? (shielded30d / denom30d) * 100 : 0,
    recentFullyShieldedPercent: shielded30d > 0 ? (fullyShielded30d / shielded30d) * 100 : 0,
    reshieldPercent,
  };
}

/**
 * Build v2 score inputs from pre-aggregated rolling-window counts.
 * Used by backfill-privacy-trends.js for efficient historical recomputation.
 */
function computeScoreInputsFromCounts({
  shielded30d = 0,
  transparent30d = 0,
  fullyShielded30d = 0,
  deshielded90dZat = 0,
  reshielded90dZat = 0,
  supplyShieldedPercent = 0,
}) {
  const denom30d = shielded30d + transparent30d;
  const reshieldPercent =
    deshielded90dZat > 0 ? (reshielded90dZat / deshielded90dZat) * 100 : 0;

  return {
    recentShieldedPercent: denom30d > 0 ? (shielded30d / denom30d) * 100 : 0,
    recentFullyShieldedPercent: shielded30d > 0 ? (fullyShielded30d / shielded30d) * 100 : 0,
    supplyShieldedPercent,
    reshieldPercent,
  };
}

/**
 * Rolling v2 inputs as they would have been on a specific UTC date (end of day).
 */
async function fetchPrivacyScoreInputsAsOf(pool, asOfDateStr) {
  const dayEnd = Math.floor(new Date(`${asOfDateStr}T23:59:59Z`).getTime() / 1000);
  const txWindowStart = dayEnd - 30 * 86400;

  const tx30d = (await pool.query(
    `
    SELECT
      COUNT(*) FILTER (WHERE has_sapling OR has_orchard OR has_ironwood) AS shielded,
      COUNT(*) FILTER (
        WHERE NOT is_coinbase
          AND NOT has_sapling AND NOT has_orchard AND NOT has_ironwood
      ) AS transparent,
      COUNT(*) FILTER (
        WHERE (has_sapling OR has_orchard OR has_ironwood)
          AND vin_count = 0 AND vout_count = 0
          AND NOT is_coinbase
      ) AS fully_shielded
    FROM transactions
    WHERE block_height > 0
      AND block_time >= $1
      AND block_time <= $2
  `,
    [txWindowStart, dayEnd],
  )).rows[0];

  let reshieldPercent = 0;
  try {
    const turnstile = (await pool.query(
      `
      SELECT
        COALESCE(SUM(deshielded_zat), 0) AS deshielded,
        COALESCE(SUM(reshielded_zat), 0) AS reshielded
      FROM turnstile_daily
      WHERE date >= ($1::date - INTERVAL '90 days')
        AND date <= $1::date
    `,
      [asOfDateStr],
    )).rows[0];
    const deshielded = Number(turnstile.deshielded) || 0;
    const reshielded = Number(turnstile.reshielded) || 0;
    reshieldPercent = deshielded > 0 ? (reshielded / deshielded) * 100 : 0;
  } catch {
    reshieldPercent = 0;
  }

  const shielded30d = parseInt(tx30d.shielded, 10) || 0;
  const transparent30d = parseInt(tx30d.transparent, 10) || 0;
  const fullyShielded30d = parseInt(tx30d.fully_shielded, 10) || 0;

  return {
    recentShieldedPercent:
      shielded30d + transparent30d > 0
        ? (shielded30d / (shielded30d + transparent30d)) * 100
        : 0,
    recentFullyShieldedPercent:
      shielded30d > 0 ? (fullyShielded30d / shielded30d) * 100 : 0,
    reshieldPercent,
  };
}

module.exports = {
  WEIGHTS,
  calculatePrivacyScore,
  fetchPrivacyScoreInputs,
  fetchPrivacyScoreInputsAsOf,
  computeScoreInputsFromCounts,
};
