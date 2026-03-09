/**
 * Privacy / Blend Check Routes
 * /api/privacy-check
 *
 * Check how common a ZEC amount is on the blockchain.
 * Uses in-memory cache (5 min TTL) to avoid repeated heavy queries.
 */

const express = require('express');
const router = express.Router();

let pool;

router.use((req, res, next) => {
  pool = req.app.locals.pool;
  next();
});

const ZATOSHI = 100000000;

// Simple in-memory cache: key → { data, expires }
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCached(key) {
  const entry = cache.get(key);
  if (entry && entry.expires > Date.now()) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, expires: Date.now() + CACHE_TTL_MS });
  // Evict old entries if cache grows too large
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

    // Round to avoid cache misses on tiny floating point differences
    const roundedAmount = parseFloat(amount.toPrecision(6));
    const cacheKey = `blend:${roundedAmount}:${tolerance}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const amountZat = Math.round(roundedAmount * ZATOSHI);
    const toleranceFrac = tolerance / 100;
    const lower = Math.round(amountZat * (1 - toleranceFrac));
    const upper = Math.round(amountZat * (1 + toleranceFrac));

    // Query ONLY the matches (not full table count) — much faster with an index on value
    // Use a 10-second statement timeout to prevent hanging
    const client = await pool.connect();
    try {
      await client.query('SET statement_timeout = 10000');

      const periods = ['24h', '7d', '30d', 'all'];
      const results = {};

      for (const period of periods) {
        const since = period === 'all' ? 0 : getPeriodStart(period);

        const { rows } = await client.query(`
          SELECT COUNT(*) AS matches
          FROM transaction_outputs o
          JOIN transactions t ON t.txid = o.txid
          WHERE o.value BETWEEN $1 AND $2
            AND t.block_time >= $3
            AND t.is_coinbase = false
        `, [lower, upper, since]);

        results[period] = {
          matches: parseInt(rows[0].matches),
        };
      }

      // Get total output count for 30d (cached separately, updates rarely)
      let total30d = getCached('total:30d');
      if (!total30d) {
        const { rows: totalRows } = await client.query(`
          SELECT COUNT(*) AS cnt
          FROM transactions
          WHERE block_time >= $1 AND is_coinbase = false
        `, [getPeriodStart('30d')]);
        total30d = parseInt(totalRows[0].cnt);
        setCache('total:30d', total30d);
      }

      // Blend score: how common is this amount relative to other amounts?
      // Simple heuristic: log-scale based on 30d match count
      const matches30d = results['30d'].matches;
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

      // Nearby popular amounts: find common output values in a range around the input
      const rangeLower = Math.round(amountZat * 0.2);
      const rangeUpper = Math.round(amountZat * 5);
      const bucketSize = Math.max(Math.round(amountZat * 0.01), 1000);

      const { rows: popularRows } = await client.query(`
        SELECT
          ROUND(o.value / $1::numeric) * $1 AS bucket_zat,
          COUNT(*) AS cnt
        FROM transaction_outputs o
        JOIN transactions t ON t.txid = o.txid
        WHERE o.value BETWEEN $2 AND $3
          AND t.block_time >= $4
          AND t.is_coinbase = false
          AND o.value > 0
        GROUP BY bucket_zat
        HAVING COUNT(*) >= 3
        ORDER BY cnt DESC
        LIMIT 10
      `, [bucketSize, rangeLower, rangeUpper, getPeriodStart('30d')]);

      const nearbyPopular = popularRows.map(r => ({
        amount: parseFloat((parseInt(r.bucket_zat) / ZATOSHI).toFixed(8)),
        count: parseInt(r.cnt),
      }));

      await client.query('RESET statement_timeout');

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

    } finally {
      client.release();
    }

  } catch (err) {
    console.error('Privacy check error:', err.message || err);
    if (err.message?.includes('statement timeout')) {
      return res.status(504).json({
        error: 'Query timed out. Try again in a moment.',
        hint: 'CREATE INDEX CONCURRENTLY idx_txout_value ON transaction_outputs (value);',
      });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
