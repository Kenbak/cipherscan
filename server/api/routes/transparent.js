/**
 * Transparent Address Routes — Quantum Exposure (Project 11)
 *
 * Endpoints for identifying transparent public-key exposures.
 * Used by Project 11's Quantum RISQ List.
 *
 * - GET /api/transparent/exposed — paginated list of exposed addresses
 * - GET /api/transparent/exposed/summary — aggregate stats
 *
 * Canonical exposure metadata is written by cipherscan-rust to
 * transparent_key_exposures. Reusable address balances and addressless direct
 * P2PK/bare-multisig UTXOs are deliberately reported separately.
 */

const express = require('express');
const router = express.Router();
const { validate } = require('../validation');
const { applyListCacheHeaders, createListCache } = require('../list-cache');

const disabledListCache = createListCache({ enabled: false });

let pool;
let listCache;
let chainTip;

router.use((req, res, next) => {
  pool = req.app.locals.pool;
  listCache = req.app.locals.listCache || disabledListCache;
  chainTip = req.app.locals.chainTip || { height: 0, hash: '' };
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
      params: { limit, offset, cursor, sort, minBalance, tipHeight: chainTip.height },
      freshTtlSeconds: 300,
      staleTtlSeconds: 1800,
      cacheable,
      shouldCache: (value) => value?.success === true,
      load: async ({ measure }) => {
        let listResult;
        let countResult;

        // A reusable address is exposed either by spending one of its own
        // outputs or because the same public key appeared directly in a P2PK
        // or bare-multisig script. The latter is an analytical relationship;
        // direct output value is never added to the reusable address balance.
        const canonicalExposureFilter = `(
                a.total_sent > 0
                OR EXISTS (
                  SELECT 1
                  FROM transparent_key_exposures e
                  WHERE e.derived_address = a.address
                )
              )`;
        const exposureExpr = `CASE
                WHEN a.total_sent > 0 THEN 'spent'
                ELSE 'public_key_disclosed'
              END`;
        const scriptTypeExpr = `CASE
                WHEN a.address LIKE 't3%' OR a.address LIKE 't2%' THEN 'scripthash'
                ELSE 'pubkeyhash'
              END`;

        if (sort === 'address' && cursor) {
          [listResult, countResult] = await measure('db_exposed', () => Promise.all([
            pool.query(
              `SELECT a.address, a.balance, a.total_sent,
                ${exposureExpr} AS exposure_reason,
                ${scriptTypeExpr} AS script_type
              FROM addresses a
              WHERE a.balance > $1
                AND a.address > $2
                AND ${canonicalExposureFilter}
              ORDER BY a.address ASC
              LIMIT $3`,
              [minBalance, cursor, limit]
            ),
            pool.query(
              `SELECT COUNT(*)
               FROM addresses a
               WHERE a.balance > $1
                 AND ${canonicalExposureFilter}`,
              [minBalance]
            ),
          ]));
        } else {
          [listResult, countResult] = await measure('db_exposed', () => Promise.all([
            pool.query(
              `SELECT a.address, a.balance, a.total_sent,
                ${exposureExpr} AS exposure_reason,
                ${scriptTypeExpr} AS script_type
              FROM addresses a
              WHERE a.balance > $1
                AND ${canonicalExposureFilter}
              ORDER BY a.balance DESC
              LIMIT $2 OFFSET $3`,
              [minBalance, limit, offset]
            ),
            pool.query(
              `SELECT COUNT(*)
               FROM addresses a
               WHERE a.balance > $1
                 AND ${canonicalExposureFilter}`,
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
            script_type: row.script_type,
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
          coverage: {
            listed: 'reusable_address_balances',
            directAddressless: 'reported_by_summary',
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
      params: { tipHeight: chainTip.height },
      freshTtlSeconds: 300,
      staleTtlSeconds: 1800,
      cacheable: true,
      shouldCache: (value) => value?.success === true,
      load: async ({ measure }) => {
        const [addressResult, directResult] = await measure('db_summary', () => Promise.all([
          pool.query(
            `SELECT COUNT(*) AS total_addresses,
                    COALESCE(SUM(a.balance), 0) AS total_balance
             FROM addresses a
             WHERE a.balance > 0
               AND (
                 a.total_sent > 0
                 OR EXISTS (
                   SELECT 1
                   FROM transparent_key_exposures e
                   WHERE e.derived_address = a.address
                 )
               )`
          ),
          pool.query(
            `WITH direct_outputs AS (
               SELECT txid, vout_index,
                      CASE
                        WHEN BOOL_OR(script_type = 'multisig') THEN 'multisig'
                        ELSE 'pubkey'
                      END AS script_type,
                      COUNT(*) AS exposed_key_count
               FROM transparent_key_exposures
               WHERE script_type IN ('pubkey', 'multisig')
               GROUP BY txid, vout_index
             ),
             unspent_direct AS (
               SELECT d.txid, d.vout_index, d.script_type, d.exposed_key_count, o.value
               FROM direct_outputs d
               JOIN transaction_outputs o
                 ON o.txid = d.txid AND o.vout_index = d.vout_index
               WHERE o.address IS NULL
                 AND NOT EXISTS (
                   SELECT 1
                   FROM transaction_inputs i
                   WHERE i.prev_txid = d.txid AND i.prev_vout = d.vout_index
                 )
             )
             SELECT COUNT(*) AS output_count,
                    COALESCE(SUM(exposed_key_count), 0) AS exposed_key_count,
                    COALESCE(SUM(value), 0) AS total_balance,
                    COUNT(*) FILTER (WHERE script_type = 'pubkey') AS p2pk_output_count,
                    COALESCE(SUM(value) FILTER (WHERE script_type = 'pubkey'), 0) AS p2pk_balance,
                    COUNT(*) FILTER (WHERE script_type = 'multisig') AS multisig_output_count,
                    COALESCE(SUM(value) FILTER (WHERE script_type = 'multisig'), 0) AS multisig_balance
             FROM unspent_direct`
          ),
        ]));

        const { total_addresses, total_balance } = addressResult.rows[0];
        const direct = directResult.rows[0];
        const reusableBalance = parseInt(total_balance);
        const directBalance = parseInt(direct.total_balance);

        return {
          success: true,
          total_addresses: parseInt(total_addresses),
          total_balance: reusableBalance,
          total_balance_zec: parseFloat(total_balance) / 1e8,
          directAddressless: {
            output_count: parseInt(direct.output_count),
            exposed_key_count: parseInt(direct.exposed_key_count),
            total_balance: directBalance,
            total_balance_zec: directBalance / 1e8,
            p2pk_output_count: parseInt(direct.p2pk_output_count),
            p2pk_balance: parseInt(direct.p2pk_balance),
            multisig_output_count: parseInt(direct.multisig_output_count),
            multisig_balance: parseInt(direct.multisig_balance),
          },
          combined_total_balance: reusableBalance + directBalance,
          combined_total_balance_zec: (reusableBalance + directBalance) / 1e8,
          coverage: {
            reusableAddressBalances: 'canonical_exposed_addresses',
            directAddressless: 'unspent_p2pk_and_bare_multisig_outputs',
            mutuallyExclusive: true,
          },
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
