/**
 * Transaction list routes — cursor-based pagination for /txs pages.
 */

const express = require('express');
const router = express.Router();
const { applyListCacheHeaders } = require('../../list-cache');
const {
  deps,
  isCanonicalIntegerQuery,
  isCanonicalDecimalQuery,
  isKnownQueryValue,
  finiteOrNull,
} = require('./_helpers');

router.get('/api/transactions/list', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100);
    const cursor = req.query.cursor ? parseInt(req.query.cursor) : null;
    const cursorIdx = req.query.cursor_idx !== undefined ? parseInt(req.query.cursor_idx) : null;
    const direction = req.query.direction || 'next';
    const typeFilter = req.query.type || 'all'; // all, shielded, transparent, coinbase
    const isLatest = cursor === null;
    const cacheable = isCanonicalIntegerQuery(req.query.limit)
      && isCanonicalIntegerQuery(req.query.cursor)
      && isCanonicalIntegerQuery(req.query.cursor_idx)
      && isKnownQueryValue(req.query.direction, ['next', 'prev'])
      && isKnownQueryValue(req.query.type, ['all', 'shielded', 'transparent', 'coinbase']);

    const outcome = await deps.listCache.getOrLoad({
      family: 'transactions',
      params: {
        limit,
        cursor: finiteOrNull(cursor),
        cursorIdx: isLatest ? null : finiteOrNull(cursorIdx || 0),
        direction: isLatest ? 'next' : (direction === 'prev' ? 'prev' : 'next'),
        type: typeof typeFilter === 'string' ? typeFilter : null,
        tipHeight: deps.chainTip.height,
      },
      freshTtlSeconds: isLatest ? 15 : 300,
      staleTtlSeconds: isLatest ? 300 : 3600,
      cacheable,
      shouldCache: (value) => value?.success === true,
      load: async ({ measure }) => {
        // Build type filter
        let typeCondition = '';
        if (typeFilter === 'shielded') {
          typeCondition = 'AND (t.has_sapling = true OR t.has_orchard = true OR t.has_ironwood = true)';
        } else if (typeFilter === 'transparent') {
          typeCondition = 'AND t.has_sapling = false AND t.has_orchard = false AND t.has_ironwood = false AND t.is_coinbase = false';
        } else if (typeFilter === 'coinbase') {
          typeCondition = 'AND t.is_coinbase = true';
        }

        // Keep the unfiltered total as a fast planner estimate. Filtered counts use
        // the same canonical identity join as the returned rows.
        const total = await measure('db_count', async () => {
          if (typeFilter === 'all') {
            const countResult = await deps.pool.query(
              `SELECT reltuples::bigint AS count FROM pg_class WHERE relname = 'transactions'`
            );
            return parseInt(countResult.rows[0]?.count) || 0;
          }
          const countResult = await deps.pool.query(
            `SELECT COUNT(*) as count
             FROM transactions t
             JOIN blocks b ON b.height = t.block_height AND b.hash = t.block_hash
             WHERE true ${typeCondition}`
          );
          return parseInt(countResult.rows[0]?.count) || 0;
        });

        const txCols = `t.txid, t.block_height, t.block_hash, t.block_time, t.tx_index,
                    t.size, t.vin_count, t.vout_count,
                    t.has_sapling, t.has_orchard, t.has_ironwood, t.has_sprout,
                    t.is_coinbase, t.value_balance,
                    t.value_balance_sapling, t.value_balance_orchard, t.value_balance_ironwood,
                    t.ironwood_actions, t.flow_type,
                    t.fee, t.total_input, t.total_output`;
        const result = await measure('db_rows', async () => {
          if (cursor === null) {
            return deps.pool.query(
              `SELECT ${txCols}
               FROM transactions t
               WHERE true ${typeCondition}
               ORDER BY t.block_height DESC, t.tx_index DESC
               LIMIT $1`,
              [limit]
            );
          }
          if (direction === 'prev') {
            const previous = await deps.pool.query(
              `SELECT ${txCols}
               FROM transactions t
               WHERE (t.block_height > $1 OR (t.block_height = $1 AND t.tx_index > $2)) ${typeCondition}
               ORDER BY t.block_height ASC, t.tx_index ASC
               LIMIT $3`,
              [cursor, cursorIdx || 0, limit]
            );
            previous.rows.reverse();
            return previous;
          }
          return deps.pool.query(
            `SELECT ${txCols}
             FROM transactions t
             WHERE (t.block_height < $1 OR (t.block_height = $1 AND t.tx_index < $2)) ${typeCondition}
             ORDER BY t.block_height DESC, t.tx_index DESC
             LIMIT $3`,
            [cursor, cursorIdx || 0, limit]
          );
        });

        const rows = result.rows;
        const totalPages = Math.ceil(total / limit);

        // Compute cursors from first/last rows
        const first = rows[0];
        const last = rows[rows.length - 1];

        return {
          success: true,
          transactions: rows,
          pagination: {
            total,
            totalPages,
            limit,
            hasNext: rows.length === limit,
            hasPrev: cursor !== null,
            nextCursor: last ? parseInt(last.block_height) : null,
            nextCursorIdx: last ? (last.tx_index ?? 0) : null,
            prevCursor: first ? parseInt(first.block_height) : null,
            prevCursorIdx: first ? (first.tx_index ?? 0) : null,
          },
        };
      },
    });

    applyListCacheHeaders(res, outcome);
    res.json(outcome.value);
  } catch (error) {
    console.error('Error fetching transactions list:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch transactions' });
  }
});

router.get('/api/shielded/list', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100);
    const cursor = req.query.cursor ? parseInt(req.query.cursor) : null;
    const cursorId = req.query.cursor_id ? parseInt(req.query.cursor_id) : null;
    const direction = req.query.direction || 'next';
    const flowType = req.query.flow_type || 'all'; // all, shield, deshield, fully_shielded
    const poolFilter = req.query.pool || 'all'; // all, sapling, orchard, ironwood, mixed
    const minZec = parseFloat(req.query.min_zec) || 0;
    const isLatest = cursor === null;
    const cacheable = isCanonicalIntegerQuery(req.query.limit)
      && isCanonicalIntegerQuery(req.query.cursor)
      && isCanonicalIntegerQuery(req.query.cursor_id)
      && isKnownQueryValue(req.query.direction, ['next', 'prev'])
      && isKnownQueryValue(req.query.flow_type, ['all', 'shield', 'deshield', 'fully_shielded'])
      && isKnownQueryValue(req.query.pool, ['all', 'sapling', 'orchard', 'ironwood', 'mixed'])
      && isCanonicalDecimalQuery(req.query.min_zec);

    const outcome = await deps.listCache.getOrLoad({
      family: 'shielded-flows',
      params: {
        limit,
        cursor: finiteOrNull(cursor),
        cursorId: isLatest ? null : finiteOrNull(cursorId || 0),
        direction: isLatest ? 'next' : (direction === 'prev' ? 'prev' : 'next'),
        flowType: typeof flowType === 'string' ? flowType : null,
        pool: typeof poolFilter === 'string' ? poolFilter : null,
        minZec: finiteOrNull(minZec),
        tipHeight: deps.chainTip.height,
      },
      freshTtlSeconds: isLatest ? 15 : 300,
      staleTtlSeconds: isLatest ? 300 : 3600,
      cacheable,
      shouldCache: (value) => value?.success === true,
      load: async ({ measure }) => measure('db', async () => {

        // Fully shielded txs live in `transactions`, not `shielded_flows`
        if (flowType === 'fully_shielded') {
      const conditions = [
        't.vin_count = 0',
        't.vout_count = 0',
        't.is_coinbase = false',
        '(t.has_sapling = true OR t.has_orchard = true OR t.has_ironwood = true)',
      ];
      const params = [];
      let paramIdx = 1;

      if (poolFilter === 'orchard') conditions.push('t.has_orchard = true');
      else if (poolFilter === 'sapling') conditions.push('t.has_sapling = true');
      else if (poolFilter === 'ironwood') conditions.push('t.has_ironwood = true');

      if (minZec > 0) {
        conditions.push(`t.fee >= $${paramIdx++}`);
        params.push(Math.round(minZec * 1e8));
      }

      const whereBase = 'WHERE ' + conditions.join(' AND ');

      // Estimate count from pg_class for unfiltered, exact count for filtered
      let total;
      if (poolFilter === 'all' && minZec === 0) {
        const countResult = await deps.pool.query(
          `SELECT COUNT(*) as count FROM transactions t ${whereBase}`,
          params
        );
        total = parseInt(countResult.rows[0]?.count) || 0;
      } else {
        const countResult = await deps.pool.query(
          `SELECT COUNT(*) as count FROM transactions t ${whereBase}`,
          params
        );
        total = parseInt(countResult.rows[0]?.count) || 0;
      }

      let result;
      const selectCols = `t.txid, t.block_height, t.block_time, t.has_sapling, t.has_orchard, t.has_ironwood,
        t.orchard_actions, t.ironwood_actions, t.sapling_spend_count, t.sapling_output_count, t.fee`;

      if (cursor === null) {
        result = await deps.pool.query(
          `SELECT ${selectCols} FROM transactions t ${whereBase}
           ORDER BY t.block_time DESC, t.txid DESC
           LIMIT $${paramIdx}`,
          [...params, limit]
        );
      } else if (direction === 'prev') {
        const cursorCond = `(t.block_time > $${paramIdx} OR (t.block_time = $${paramIdx} AND t.txid > $${paramIdx + 1}))`;
        result = await deps.pool.query(
          `SELECT ${selectCols} FROM transactions t ${whereBase} AND ${cursorCond}
           ORDER BY t.block_time ASC, t.txid ASC
           LIMIT $${paramIdx + 2}`,
          [...params, cursor, cursorId || '', limit]
        );
        result.rows.reverse();
      } else {
        const cursorCond = `(t.block_time < $${paramIdx} OR (t.block_time = $${paramIdx} AND t.txid < $${paramIdx + 1}))`;
        result = await deps.pool.query(
          `SELECT ${selectCols} FROM transactions t ${whereBase} AND ${cursorCond}
           ORDER BY t.block_time DESC, t.txid DESC
           LIMIT $${paramIdx + 2}`,
          [...params, cursor, cursorId || '', limit]
        );
      }

      const rows = result.rows;
      const totalPages = Math.ceil(total / limit);
      const first = rows[0];
      const last = rows[rows.length - 1];

      // Determine pool for each tx
      const resolvePool = (r) => {
        if (r.has_ironwood) return 'ironwood';
        if (r.has_orchard) return 'orchard';
        if (r.has_sapling) return 'sapling';
        return 'unknown';
      };

      return {
        success: true,
        flows: rows.map((r, i) => ({
          id: i,
          txid: r.txid,
          blockHeight: parseInt(r.block_height),
          blockTime: parseInt(r.block_time),
          flowType: 'fully_shielded',
          amountZec: null,
          pool: resolvePool(r),
          actions: parseInt(r.orchard_actions || 0) + parseInt(r.ironwood_actions || 0) + parseInt(r.sapling_spend_count || 0) + parseInt(r.sapling_output_count || 0),
          addresses: [],
        })),
        pagination: {
          total,
          totalPages,
          limit,
          hasNext: rows.length === limit,
          hasPrev: cursor !== null,
          nextCursor: last ? parseInt(last.block_time) : null,
          nextCursorId: last ? last.txid : null,
          prevCursor: first ? parseInt(first.block_time) : null,
          prevCursorId: first ? first.txid : null,
        },
      };
    }

    // "All" merges shielded_flows + fully-shielded txs via UNION
    // "shield"/"deshield" only query shielded_flows
    const isAllView = flowType === 'all';

    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (!isAllView) {
      conditions.push(`sf.flow_type = $${paramIdx++}`);
      params.push(flowType);
    }
    if (poolFilter !== 'all') {
      conditions.push(`sf.pool = $${paramIdx++}`);
      params.push(poolFilter);
    }
    if (minZec > 0) {
      conditions.push(`sf.amount_zat >= $${paramIdx++}`);
      params.push(Math.round(minZec * 1e8));
    }

    const whereBase = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const canonicalFlowJoin = `FROM shielded_flows sf
      JOIN transactions t ON t.txid = sf.txid AND t.block_height = sf.block_height`;

    // For "All" with no pool/amount filters, use fast estimate
    let total;
    if (isAllView && conditions.length === 0) {
      const [flowCount, fsCount] = await Promise.all([
        deps.pool.query(`SELECT reltuples::bigint AS count FROM pg_class WHERE relname = 'shielded_flows'`),
        deps.pool.query(`SELECT COUNT(*) as count FROM transactions t WHERE t.vin_count = 0 AND t.vout_count = 0 AND t.is_coinbase = false AND (t.has_sapling = true OR t.has_orchard = true OR t.has_ironwood = true)`),
      ]);
      total = (parseInt(flowCount.rows[0]?.count) || 0) + (parseInt(fsCount.rows[0]?.count) || 0);
    } else if (conditions.length === 0) {
      const countResult = await deps.pool.query(
        `SELECT reltuples::bigint AS count FROM pg_class WHERE relname = 'shielded_flows'`
      );
      total = parseInt(countResult.rows[0]?.count) || 0;
    } else {
      const countResult = await deps.pool.query(
        `SELECT COUNT(*) as count ${canonicalFlowJoin} ${whereBase}`,
        params
      );
      total = parseInt(countResult.rows[0]?.count) || 0;
    }

    let result;

    if (isAllView && poolFilter === 'all' && minZec === 0) {
      // UNION: shielded_flows + fully shielded txs, ordered by time
      const unionQuery = `
        (SELECT sf.id, sf.txid, sf.block_height, sf.block_time,
          sf.flow_type, sf.amount_zat, sf.pool, sf.transparent_addresses
         FROM shielded_flows sf
         JOIN transactions t ON t.txid = sf.txid AND t.block_height = sf.block_height)
        UNION ALL
        (SELECT 0 as id, t.txid, t.block_height, t.block_time,
          'fully_shielded' as flow_type, NULL as amount_zat,
          CASE WHEN t.has_ironwood THEN 'ironwood' WHEN t.has_orchard THEN 'orchard' ELSE 'sapling' END as pool,
          ARRAY[]::text[] as transparent_addresses
         FROM transactions t
         WHERE t.vin_count = 0 AND t.vout_count = 0 AND t.is_coinbase = false
           AND (t.has_sapling = true OR t.has_orchard = true OR t.has_ironwood = true))
      `;

      if (cursor === null) {
        result = await deps.pool.query(
          `SELECT * FROM (${unionQuery}) u ORDER BY u.block_time DESC, u.id DESC LIMIT $1`,
          [limit]
        );
      } else if (direction === 'prev') {
        result = await deps.pool.query(
          `SELECT * FROM (${unionQuery}) u WHERE u.block_time > $1 OR (u.block_time = $1 AND u.id > $2) ORDER BY u.block_time ASC, u.id ASC LIMIT $3`,
          [cursor, cursorId || 0, limit]
        );
        result.rows.reverse();
      } else {
        result = await deps.pool.query(
          `SELECT * FROM (${unionQuery}) u WHERE u.block_time < $1 OR (u.block_time = $1 AND u.id < $2) ORDER BY u.block_time DESC, u.id DESC LIMIT $3`,
          [cursor, cursorId || 0, limit]
        );
      }
    } else {
      // Standard flows-only query (shield/deshield filter, or pool/amount filters)
      const selectCols = `sf.id, sf.txid, sf.block_height, sf.block_time,
        sf.flow_type, sf.amount_zat, sf.pool, sf.transparent_addresses`;

      if (cursor === null) {
        result = await deps.pool.query(
          `SELECT ${selectCols} ${canonicalFlowJoin}
           ${whereBase ? whereBase + ' AND' : 'WHERE'} true
           ORDER BY sf.block_time DESC, sf.id DESC
           LIMIT $${paramIdx}`,
          [...params, limit]
        );
      } else if (direction === 'prev') {
        const cursorCond = `(sf.block_time > $${paramIdx} OR (sf.block_time = $${paramIdx} AND sf.id > $${paramIdx + 1}))`;
        result = await deps.pool.query(
          `SELECT ${selectCols} ${canonicalFlowJoin}
           ${whereBase ? whereBase + ' AND' : 'WHERE'} ${cursorCond}
           ORDER BY sf.block_time ASC, sf.id ASC
           LIMIT $${paramIdx + 2}`,
          [...params, cursor, cursorId || 0, limit]
        );
        result.rows.reverse();
      } else {
        const cursorCond = `(sf.block_time < $${paramIdx} OR (sf.block_time = $${paramIdx} AND sf.id < $${paramIdx + 1}))`;
        result = await deps.pool.query(
          `SELECT ${selectCols} ${canonicalFlowJoin}
           ${whereBase ? whereBase + ' AND' : 'WHERE'} ${cursorCond}
           ORDER BY sf.block_time DESC, sf.id DESC
           LIMIT $${paramIdx + 2}`,
          [...params, cursor, cursorId || 0, limit]
        );
      }
    }

    const rows = result.rows;
    const totalPages = Math.ceil(total / limit);
    const first = rows[0];
    const last = rows[rows.length - 1];

    return {
      success: true,
      flows: rows.map(r => ({
        id: r.id,
        txid: r.txid,
        blockHeight: parseInt(r.block_height),
        blockTime: parseInt(r.block_time),
        flowType: r.flow_type,
        amountZec: r.amount_zat != null ? parseInt(r.amount_zat) / 1e8 : null,
        pool: r.pool,
        addresses: r.transparent_addresses || [],
      })),
      pagination: {
        total,
        totalPages,
        limit,
        hasNext: rows.length === limit,
        hasPrev: cursor !== null,
        nextCursor: last ? parseInt(last.block_time) : null,
        nextCursorId: last ? last.id : null,
        prevCursor: first ? parseInt(first.block_time) : null,
        prevCursorId: first ? first.id : null,
      },
    };
      }),
    });

    applyListCacheHeaders(res, outcome);
    res.json(outcome.value);
  } catch (error) {
    console.error('Error fetching shielded flows list:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch shielded flows' });
  }
});

module.exports = router;
