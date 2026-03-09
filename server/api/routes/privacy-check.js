/**
 * Privacy / Blend Check Routes
 * /api/privacy-check
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

/**
 * GET /api/privacy-check?amount=1.25&tolerance=2
 */
router.get('/api/privacy-check', async (req, res) => {
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

    // Blend score based on 30d total match count
    const matches30d = results['30d'].total;
    let blendScore;
    if (matches30d >= 10000) blendScore = 95;
    else if (matches30d >= 5000) blendScore = 85;
    else if (matches30d >= 1000) blendScore = 75;
    else if (matches30d >= 500) blendScore = 65;
    else if (matches30d >= 100) blendScore = 50;
    else if (matches30d >= 50) blendScore = 40;
    else if (matches30d >= 10) blendScore = 25;
    else if (matches30d >= 1) blendScore = 10;
    else blendScore = 0;

    const blendLabel = blendScore >= 70 ? 'Blends well' : blendScore >= 40 ? 'Moderate' : 'Stands out';

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

module.exports = router;
