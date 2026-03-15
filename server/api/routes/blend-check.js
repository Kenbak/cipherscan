/**
 * Privacy / Blend Check Routes
 * /api/blend-check
 *
 * Check how common a ZEC amount is on the blockchain.
 * Uses the shielded_flows table (same source as privacy-risks common amounts).
 * Returns shield/deshield breakdown per time period.
 * Results cached in-memory for 5 minutes.
 */

const express = require('express');
const router = express.Router();

let pool;

router.use((req, res, next) => {
  pool = req.app.locals.pool;
  next();
});

const ZATOSHI = 100000000;

const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCached(key) {
  const entry = cache.get(key);
  if (entry && entry.expires > Date.now()) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, expires: Date.now() + CACHE_TTL_MS });
  if (cache.size > 500) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (v.expires < now) cache.delete(k);
    }
  }
}

function getPeriodStart(period) {
  const now = Math.floor(Date.now() / 1000);
  switch (period) {
    case '24h': return now - 86400;
    case '7d': return now - 7 * 86400;
    case '30d': return now - 30 * 86400;
    default: return 0;
  }
}

function computeBlendScore(count30d) {
  if (count30d >= 10000) return 95;
  if (count30d >= 5000) return 85;
  if (count30d >= 1000) return 75;
  if (count30d >= 500) return 65;
  if (count30d >= 100) return 50;
  if (count30d >= 50) return 40;
  if (count30d >= 10) return 25;
  if (count30d >= 1) return 10;
  return 0;
}

function getBlendLabel(score) {
  if (score >= 70) return 'Blends well';
  if (score >= 40) return 'Moderate';
  return 'Stands out';
}

/**
 * Greedy decomposition: split targetZat into common denominations.
 * Reserves one slot for the remainder.
 */
function greedySplit(targetZat, denominations, maxPieces) {
  let remaining = targetZat;
  const pieces = [];

  for (const denom of denominations) {
    while (remaining >= denom.amountZat && pieces.length < maxPieces - 1) {
      pieces.push({
        amountZat: denom.amountZat,
        amount: denom.amount,
        count30d: denom.count,
        blendScore: denom.blendScore,
        isCommon: true,
      });
      remaining -= denom.amountZat;
      if (remaining <= 100) { remaining = 0; break; }
    }
    if (pieces.length >= maxPieces - 1 || remaining <= 0) break;
  }

  if (remaining > 100) {
    pieces.push({
      amountZat: remaining,
      amount: remaining / ZATOSHI,
      isRemainder: true,
      isCommon: false,
    });
  }

  return pieces;
}

/**
 * GET /api/blend-check?amount=1.25&tolerance=2
 */
router.get('/api/blend-check', async (req, res) => {
  try {
    const amount = parseFloat(req.query.amount);
    const tolerance = Math.min(parseFloat(req.query.tolerance) || 2, 10);

    if (isNaN(amount) || amount <= 0 || amount > 21000000) {
      return res.status(400).json({ error: 'Invalid amount. Must be > 0 and <= 21M ZEC.' });
    }

    const roundedAmount = parseFloat(amount.toPrecision(6));
    const cacheKey = `blend:${roundedAmount}:${tolerance}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const amountZat = Math.round(roundedAmount * ZATOSHI);
    const toleranceFrac = tolerance / 100;
    const lower = Math.round(amountZat * (1 - toleranceFrac));
    const upper = Math.round(amountZat * (1 + toleranceFrac));

    const periods = ['24h', '7d', '30d', 'all'];
    const results = {};

    for (const period of periods) {
      const since = period === 'all' ? 0 : getPeriodStart(period);

      const { rows } = await pool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE flow_type = 'shield') AS shields,
          COUNT(*) FILTER (WHERE flow_type = 'deshield') AS deshields
        FROM shielded_flows
        WHERE amount_zat BETWEEN $1 AND $2
          AND block_time >= $3
      `, [lower, upper, since]);

      results[period] = {
        total: parseInt(rows[0].total),
        shields: parseInt(rows[0].shields),
        deshields: parseInt(rows[0].deshields),
      };
    }

    const matches30d = results['30d'].total;
    const blendScore = computeBlendScore(matches30d);
    const blendLabel = getBlendLabel(blendScore);

    // Nearby popular amounts
    const rangeLower = Math.round(amountZat * 0.2);
    const rangeUpper = Math.round(amountZat * 5);

    const { rows: popularRows } = await pool.query(`
      SELECT
        ROUND(amount_zat / 100000000.0, 2) AS amount_zec,
        COUNT(*) AS cnt
      FROM shielded_flows
      WHERE amount_zat BETWEEN $1 AND $2
        AND block_time >= $3
        AND amount_zat >= 1000000
      GROUP BY ROUND(amount_zat / 100000000.0, 2)
      HAVING COUNT(*) >= 3
      ORDER BY cnt DESC
      LIMIT 10
    `, [rangeLower, rangeUpper, getPeriodStart('30d')]);

    const nearbyPopular = popularRows.map(r => ({
      amount: parseFloat(r.amount_zec),
      count: parseInt(r.cnt),
    }));

    const response = {
      amount: roundedAmount,
      tolerancePercent: tolerance,
      periods: results,
      blendScore,
      blendLabel,
      nearbyPopular,
    };

    setCache(cacheKey, response);
    res.json(response);

  } catch (err) {
    console.error('Privacy check error:', err.message || err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/blend-check/split?amount=7.31924
 *
 * Decomposes an amount into the most common on-chain shielding denominations,
 * generating multiple plans with different piece counts so the user can choose
 * their privacy/convenience trade-off.
 */
router.get('/api/blend-check/split', async (req, res) => {
  try {
    const amount = parseFloat(req.query.amount);
    if (isNaN(amount) || amount <= 0 || amount > 21000000) {
      return res.status(400).json({ error: 'Invalid amount. Must be > 0 and <= 21M ZEC.' });
    }

    const amountZat = Math.round(amount * ZATOSHI);
    const cacheKey = `split:${amountZat}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const since30d = getPeriodStart('30d');

    const { rows: denomRows } = await pool.query(`
      SELECT
        ROUND(amount_zat / 100000000.0, 2) AS amount_zec,
        COUNT(*) AS cnt
      FROM shielded_flows
      WHERE block_time >= $1
        AND amount_zat BETWEEN 100000 AND $2
      GROUP BY ROUND(amount_zat / 100000000.0, 2)
      HAVING COUNT(*) >= 10
      ORDER BY cnt DESC
      LIMIT 50
    `, [since30d, amountZat]);

    const denominations = denomRows.map(r => {
      const amt = parseFloat(r.amount_zec);
      const count = parseInt(r.cnt);
      return {
        amount: amt,
        amountZat: Math.round(amt * ZATOSHI),
        count,
        blendScore: computeBlendScore(count),
      };
    }).sort((a, b) => b.amountZat - a.amountZat);

    const plans = [];
    const seenSigs = new Set();

    for (let maxPieces = 2; maxPieces <= 6; maxPieces++) {
      const pieces = greedySplit(amountZat, denominations, maxPieces);

      if (pieces.length === 0) continue;
      if (pieces.length === 1 && pieces[0].isRemainder) continue;

      const sig = pieces.map(p => p.amountZat).sort((a, b) => b - a).join(',');
      if (seenSigs.has(sig)) continue;
      seenSigs.add(sig);

      for (const piece of pieces) {
        if (piece.isRemainder) {
          const lower = Math.round(piece.amountZat * 0.98);
          const upper = Math.round(piece.amountZat * 1.02);
          const { rows } = await pool.query(`
            SELECT COUNT(*) AS cnt FROM shielded_flows
            WHERE amount_zat BETWEEN $1 AND $2 AND block_time >= $3
          `, [lower, upper, since30d]);
          piece.count30d = parseInt(rows[0].cnt);
          piece.blendScore = computeBlendScore(piece.count30d);
        }
      }

      const minScore = Math.min(...pieces.map(p => p.blendScore));
      const weightedAvg = pieces.reduce((s, p) => s + p.blendScore * (p.amountZat / amountZat), 0);

      plans.push({
        pieceCount: pieces.length,
        pieces: pieces.map(p => ({
          amount: parseFloat((p.amountZat / ZATOSHI).toFixed(8)),
          blendScore: p.blendScore,
          blendLabel: getBlendLabel(p.blendScore),
          count30d: p.count30d || 0,
          isRemainder: !!p.isRemainder,
        })),
        minBlendScore: minScore,
        avgBlendScore: Math.round(weightedAvg),
        overallLabel: getBlendLabel(minScore),
      });
    }

    plans.sort((a, b) => {
      if (a.minBlendScore !== b.minBlendScore) return b.minBlendScore - a.minBlendScore;
      return a.pieceCount - b.pieceCount;
    });

    if (plans.length > 0) plans[0].recommended = true;

    const response = { amount, plans };
    setCache(cacheKey, response);
    res.json(response);

  } catch (err) {
    console.error('Split calculation error:', err.message || err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
