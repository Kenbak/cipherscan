/**
 * Privacy Check Routes
 * /api/privacy-check
 *
 * Check how common a ZEC amount is on the blockchain.
 * Helps users pick amounts that blend in with the crowd.
 */

const express = require('express');
const router = express.Router();

let pool;

router.use((req, res, next) => {
  pool = req.app.locals.pool;
  next();
});

const ZATOSHI = 100000000;

// Time period boundaries in seconds
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
 *
 * Returns how common a given ZEC amount is across time periods.
 */
router.get('/api/privacy-check', async (req, res) => {
  try {
    const amount = parseFloat(req.query.amount);
    const tolerance = Math.min(parseFloat(req.query.tolerance) || 2, 10); // default 2%, max 10%

    if (isNaN(amount) || amount <= 0 || amount > 21000000) {
      return res.status(400).json({ error: 'Invalid amount. Must be > 0 and <= 21M ZEC.' });
    }

    const amountZat = Math.round(amount * ZATOSHI);
    const toleranceFrac = tolerance / 100;
    const lower = Math.round(amountZat * (1 - toleranceFrac));
    const upper = Math.round(amountZat * (1 + toleranceFrac));

    const periods = ['24h', '7d', '30d', 'all'];
    const results = {};

    for (const period of periods) {
      const since = period === 'all' ? 0 : getPeriodStart(period);

      const { rows } = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE o.value BETWEEN $1 AND $2) AS matches,
          COUNT(*) AS total
        FROM transaction_outputs o
        JOIN transactions t ON t.txid = o.txid
        WHERE t.block_time >= $3
          AND t.is_coinbase = false
          AND o.value > 0
      `, [lower, upper, since]);

      const matches = parseInt(rows[0].matches);
      const total = parseInt(rows[0].total);

      results[period] = {
        matches,
        total,
        percentage: total > 0 ? parseFloat(((matches / total) * 100).toFixed(4)) : 0,
      };
    }

    // Blend score: percentile ranking based on 30d data
    // "What percentage of amounts are LESS common than this one?"
    const { rows: percentileRows } = await pool.query(`
      WITH amount_counts AS (
        SELECT
          ROUND(o.value / $1::numeric) * $1 AS bucket,
          COUNT(*) AS cnt
        FROM transaction_outputs o
        JOIN transactions t ON t.txid = o.txid
        WHERE t.block_time >= $2
          AND t.is_coinbase = false
          AND o.value > 0
        GROUP BY bucket
      )
      SELECT
        COUNT(*) FILTER (WHERE cnt <= (
          SELECT COUNT(*) FROM transaction_outputs o2
          JOIN transactions t2 ON t2.txid = o2.txid
          WHERE t2.block_time >= $2
            AND t2.is_coinbase = false
            AND o2.value BETWEEN $3 AND $4
        )) AS less_common,
        COUNT(*) AS total_buckets
      FROM amount_counts
    `, [
      Math.max(Math.round(amountZat * 0.02), 1), // bucket size = 2% of amount
      getPeriodStart('30d'),
      lower,
      upper,
    ]);

    const lessBuckets = parseInt(percentileRows[0]?.less_common || 0);
    const totalBuckets = parseInt(percentileRows[0]?.total_buckets || 1);
    const blendScore = Math.round((lessBuckets / totalBuckets) * 100);

    // Find nearby popular amounts (top 10 most common outputs within 10x range)
    const rangeLower = Math.round(amountZat * 0.1);
    const rangeUpper = Math.round(amountZat * 10);

    const { rows: popularRows } = await pool.query(`
      SELECT
        ROUND(o.value / $1::numeric) * $1 AS bucket_zat,
        COUNT(*) AS cnt
      FROM transaction_outputs o
      JOIN transactions t ON t.txid = o.txid
      WHERE t.block_time >= $2
        AND t.is_coinbase = false
        AND o.value BETWEEN $3 AND $4
        AND o.value > 0
      GROUP BY bucket_zat
      HAVING COUNT(*) >= 5
      ORDER BY cnt DESC
      LIMIT 12
    `, [
      Math.max(Math.round(amountZat * 0.01), 1000), // 1% bucket granularity, min 0.00001 ZEC
      getPeriodStart('30d'),
      rangeLower,
      rangeUpper,
    ]);

    const nearbyPopular = popularRows.map(r => ({
      amount: parseFloat((parseInt(r.bucket_zat) / ZATOSHI).toFixed(8)),
      count: parseInt(r.cnt),
    }));

    res.json({
      amount,
      tolerancePercent: tolerance,
      periods: results,
      blendScore,
      blendLabel: blendScore >= 70 ? 'Blends well' : blendScore >= 40 ? 'Moderate' : 'Stands out',
      nearbyPopular,
    });

  } catch (err) {
    console.error('Privacy check error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
