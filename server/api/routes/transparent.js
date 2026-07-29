/**
 * Transparent Address Routes — Quantum Exposure (Project 11)
 *
 * Endpoints for identifying transparent t-addresses with exposed public keys.
 * Used by Project 11's Quantum RISQ List.
 *
 * - GET /api/transparent/exposed — paginated list of exposed addresses
 * - GET /api/transparent/exposed/summary — aggregate stats
 *
 * Required index (run once):
 *   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_addresses_exposed
 *   ON addresses (balance DESC)
 *   WHERE balance > 0 AND total_sent > 0;
 */

const express = require('express');
const router = express.Router();
const { validate } = require('../validation');
const { applyListCacheHeaders, createListCache } = require('../list-cache');

const disabledListCache = createListCache({ enabled: false });

let pool;
let listCache;

router.use((req, res, next) => {
  pool = req.app.locals.pool;
  listCache = req.app.locals.listCache || disabledListCache;
  next();
});

function isCanonicalIntegerQuery(value) {
  if (value === undefined) return true;
  if (typeof value !== 'string' || !/^-?\d+$/.test(value)) return false;
  return Number.isSafeInteger(Number.parseInt(value, 10));
}

/**
 * GET /api/transparent/exposed
 *
 * Returns paginated list of transparent addresses with exposed public keys.
 * Supports both offset-based and cursor-based pagination.
 */
router.get('/api/transparent/exposed', validate('exposedAddresses'), async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), 1000);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const cursor = req.query.cursor || null;
    const sort = req.query.sort || 'balance';
    const minBalance = Math.max(parseInt(req.query.min_balance) || 0, 0);

    const cacheable = isCanonicalIntegerQuery(req.query.limit)
      && isCanonicalIntegerQuery(req.query.offset)
      && isCanonicalIntegerQuery(req.query.min_balance);

    const cached = await listCache.getOrLoad({
      family: 'transparent-exposed',
      params: { limit, offset, cursor, sort, minBalance },
      freshTtlSeconds: 300,
      staleTtlSeconds: 1800,
      cacheable,
      shouldCache: (value) => value?.success === true,
      load: async ({ measure }) => {
        let listResult;
        let countResult;

        if (sort === 'address' && cursor) {
          // Cursor-based pagination (for bulk sequential pulls)
          [listResult, countResult] = await measure('db_exposed', () => Promise.all([
            pool.query(
              `SELECT address, balance, total_sent,
                CASE WHEN total_sent > 0 THEN 'spent' ELSE 'p2pk_recipient' END AS exposure_reason
              FROM addresses
              WHERE balance > $1
                AND address > $2
                AND (
                  total_sent > 0
                  OR address IN (
                    SELECT DISTINCT address FROM transaction_outputs
                    WHERE script_type IN ('pubkey', 'multisig') AND address IS NOT NULL
                  )
                )
              ORDER BY address ASC
              LIMIT $3`,
              [minBalance, cursor, limit]
            ),
            pool.query(
              `SELECT COUNT(*) FROM addresses
               WHERE balance > $1
               AND (
                 total_sent > 0
                 OR address IN (
                   SELECT DISTINCT address FROM transaction_outputs
                   WHERE script_type IN ('pubkey', 'multisig') AND address IS NOT NULL
                 )
               )`,
              [minBalance]
            ),
          ]));
        } else {
          // Offset-based pagination (default, sorted by balance)
          [listResult, countResult] = await measure('db_exposed', () => Promise.all([
            pool.query(
              `SELECT address, balance, total_sent,
                CASE WHEN total_sent > 0 THEN 'spent' ELSE 'p2pk_recipient' END AS exposure_reason
              FROM addresses
              WHERE balance > $1
                AND (
                  total_sent > 0
                  OR address IN (
                    SELECT DISTINCT address FROM transaction_outputs
                    WHERE script_type IN ('pubkey', 'multisig') AND address IS NOT NULL
                  )
                )
              ORDER BY balance DESC
              LIMIT $2 OFFSET $3`,
              [minBalance, limit, offset]
            ),
            pool.query(
              `SELECT COUNT(*) FROM addresses
               WHERE balance > $1
               AND (
                 total_sent > 0
                 OR address IN (
                   SELECT DISTINCT address FROM transaction_outputs
                   WHERE script_type IN ('pubkey', 'multisig') AND address IS NOT NULL
                 )
               )`,
              [minBalance]
            ),
          ]));
        }

        const total = parseInt(countResult.rows[0].count);
        const rows = listResult.rows;
        const lastAddress = rows.length > 0 ? rows[rows.length - 1].address : null;

        return {
          success: true,
          addresses: rows.map((row) => ({
            address: row.address,
            balance: parseInt(row.balance),
            balance_zec: parseFloat(row.balance) / 1e8,
            exposure_reason: row.exposure_reason,
          })),
          pagination: {
            total,
            limit,
            offset: sort === 'address' && cursor ? null : offset,
            hasNext: sort === 'address' && cursor
              ? rows.length === limit
              : offset + limit < total,
            hasPrev: sort === 'address' && cursor
              ? true
              : offset > 0,
            next_cursor: lastAddress,
          },
        };
      },
    });

    applyListCacheHeaders(res, cached);
    res.json(cached.value);
  } catch (error) {
    console.error('Error fetching exposed addresses:', error);
    res.status(500).json({ error: 'Failed to fetch exposed addresses' });
  }
});

/**
 * GET /api/transparent/exposed/summary
 *
 * Returns aggregate stats about quantum-exposed transparent addresses.
 */
router.get('/api/transparent/exposed/summary', async (req, res) => {
  try {
    const cached = await listCache.getOrLoad({
      family: 'transparent-exposed-summary',
      params: {},
      freshTtlSeconds: 300,
      staleTtlSeconds: 1800,
      cacheable: true,
      shouldCache: (value) => value?.success === true,
      load: async ({ measure }) => {
        const result = await measure('db_summary', () => pool.query(
          `SELECT COUNT(*) AS total_addresses,
                  COALESCE(SUM(balance), 0) AS total_balance
           FROM addresses
           WHERE balance > 0
           AND (
             total_sent > 0
             OR address IN (
               SELECT DISTINCT address FROM transaction_outputs
               WHERE script_type IN ('pubkey', 'multisig') AND address IS NOT NULL
             )
           )`
        ));

        const { total_addresses, total_balance } = result.rows[0];

        return {
          success: true,
          total_addresses: parseInt(total_addresses),
          total_balance: parseInt(total_balance),
          total_balance_zec: parseFloat(total_balance) / 1e8,
          last_updated: new Date().toISOString(),
        };
      },
    });

    applyListCacheHeaders(res, cached);
    res.json(cached.value);
  } catch (error) {
    console.error('Error fetching exposed summary:', error);
    res.status(500).json({ error: 'Failed to fetch exposed address summary' });
  }
});

module.exports = router;
