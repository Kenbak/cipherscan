/**
 * Bounded data feeds used by the public XML sitemap routes.
 * These endpoints return canonical inventory only and never expose pending or
 * reorganized transaction records.
 */

const express = require('express');
const router = express.Router();

const MAX_BLOCK_RANGE = 50_000;
const RECENT_TRANSACTION_LIMIT = 100;

let pool;

router.use((req, res, next) => {
  pool = req.app.locals.pool;
  res.set('X-Robots-Tag', 'noindex');
  next();
});

function parseNonNegativeInteger(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

router.get('/api/sitemaps/blocks', async (req, res) => {
  const start = parseNonNegativeInteger(req.query.start);
  const end = parseNonNegativeInteger(req.query.end);

  if (start === null || end === null || end < start || end - start + 1 > MAX_BLOCK_RANGE) {
    return res.status(400).json({
      success: false,
      error: `start and end must define a non-negative range of at most ${MAX_BLOCK_RANGE} heights`,
    });
  }

  try {
    const [blocksResult, tipResult] = await Promise.all([
      pool.query(
        `SELECT height, timestamp
         FROM blocks
         WHERE height BETWEEN $1 AND $2
         ORDER BY height ASC`,
        [start, end],
      ),
      pool.query('SELECT MAX(height) AS tip FROM blocks'),
    ]);
    const tip = Number(tipResult.rows[0]?.tip) || 0;
    const complete = tip > end;
    const maxAge = complete ? 86_400 : 300;

    res.set('Cache-Control', `public, max-age=${maxAge}, stale-while-revalidate=${Math.max(maxAge * 2, 600)}`);
    return res.json({
      success: true,
      range: { start, end },
      tip,
      complete,
      blocks: blocksResult.rows.map((block) => ({
        height: Number(block.height),
        timestamp: Number(block.timestamp) || null,
      })),
    });
  } catch (error) {
    console.error('Error generating block sitemap feed:', error);
    return res.status(500).json({ success: false, error: 'Failed to generate block sitemap feed' });
  }
});

router.get('/api/sitemaps/transactions/recent', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.txid, t.block_time
       FROM transactions t
       JOIN blocks b ON b.height = t.block_height AND b.hash = t.block_hash
       ORDER BY t.block_height DESC, t.tx_index DESC
       LIMIT $1`,
      [RECENT_TRANSACTION_LIMIT],
    );

    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    return res.json({
      success: true,
      transactions: result.rows.map((transaction) => ({
        txid: transaction.txid,
        blockTime: Number(transaction.block_time) || null,
      })),
    });
  } catch (error) {
    console.error('Error generating transaction sitemap feed:', error);
    return res.status(500).json({ success: false, error: 'Failed to generate transaction sitemap feed' });
  }
});

module.exports = router;
