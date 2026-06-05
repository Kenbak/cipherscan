/**
 * Pool Analytics Routes
 *
 * GET /api/pools/overview   — current pool sizes + 24h/7d/30d deltas
 * GET /api/pools/flows      — daily shield/deshield volume aggregation
 * GET /api/pools/turnstile  — deshield UTXO spend status (held vs moved)
 */

const express = require('express');
const router = express.Router();

let pool, redisClient;

router.use((req, res, next) => {
  pool = req.app.locals.pool;
  redisClient = req.app.locals.redisClient;
  next();
});

async function cached(key, ttl, fn) {
  try {
    if (redisClient?.isOpen) {
      const hit = await redisClient.get(key);
      if (hit) return JSON.parse(hit);
    }
  } catch {}
  const data = await fn();
  try {
    if (redisClient?.isOpen) await redisClient.setEx(key, ttl, JSON.stringify(data));
  } catch {}
  return data;
}

function periodToSeconds(period) {
  const map = { '7d': 604800, '30d': 2592000, '90d': 7776000, '1y': 31536000 };
  return map[period] || 2592000;
}

// ─── GET /api/pools/overview ────────────────────────────────────────────────

router.get('/api/pools/overview', async (req, res) => {
  try {
    const data = await cached('zcash:pools:overview', 300, async () => {
      const current = await pool.query(`
        SELECT sprout_pool_size, sapling_pool_size, orchard_pool_size,
               transparent_pool_size, shielded_pool_size, chain_supply, updated_at
        FROM privacy_stats ORDER BY updated_at DESC LIMIT 1
      `);
      if (!current.rows.length) return null;
      const s = current.rows[0];

      const deltas = await pool.query(`
        SELECT date,
               sprout_pool_size, sapling_pool_size, orchard_pool_size,
               transparent_pool_size, pool_size, chain_supply
        FROM privacy_trends_daily
        WHERE date IN (CURRENT_DATE - 1, CURRENT_DATE - 7, CURRENT_DATE - 30)
        ORDER BY date DESC
      `);

      const deltaMap = {};
      for (const r of deltas.rows) {
        const daysAgo = Math.round((Date.now() - new Date(r.date).getTime()) / 86400000);
        const key = daysAgo <= 2 ? '24h' : daysAgo <= 8 ? '7d' : '30d';
        deltaMap[key] = r;
      }

      function computeDeltas(currentZat, field) {
        const result = {};
        for (const [period, row] of Object.entries(deltaMap)) {
          const prev = Number(row[field]) || 0;
          result[period] = prev > 0 ? Number(currentZat) - prev : null;
        }
        return result;
      }

      return {
        current: {
          sprout: Number(s.sprout_pool_size) || 0,
          sapling: Number(s.sapling_pool_size) || 0,
          orchard: Number(s.orchard_pool_size) || 0,
          transparent: Number(s.transparent_pool_size) || 0,
          shielded: Number(s.shielded_pool_size) || 0,
          chainSupply: Number(s.chain_supply) || 0,
          updatedAt: s.updated_at,
        },
        deltas: {
          sprout: computeDeltas(s.sprout_pool_size, 'sprout_pool_size'),
          sapling: computeDeltas(s.sapling_pool_size, 'sapling_pool_size'),
          orchard: computeDeltas(s.orchard_pool_size, 'orchard_pool_size'),
          shielded: computeDeltas(s.shielded_pool_size, 'pool_size'),
        },
      };
    });

    if (!data) return res.status(503).json({ error: 'Pool data not available' });
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('pools/overview error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/pools/flows ───────────────────────────────────────────────────

router.get('/api/pools/flows', async (req, res) => {
  try {
    const period = req.query.period || '30d';
    const poolFilter = req.query.pool || 'all';
    const cacheKey = `zcash:pools:flows:${period}:${poolFilter}`;

    const data = await cached(cacheKey, 300, async () => {
      const since = Math.floor(Date.now() / 1000) - periodToSeconds(period);
      const params = [since];
      let poolClause = '';
      if (poolFilter !== 'all') {
        poolClause = ' AND pool = $2';
        params.push(poolFilter);
      }

      // Try materialized view first, fall back to live query
      let result;
      try {
        result = await pool.query(`
          SELECT date, flow_type, pool, total_zat, tx_count
          FROM flow_daily
          WHERE date >= DATE(TO_TIMESTAMP($1))${poolFilter !== 'all' ? ' AND pool = $2' : ''}
          ORDER BY date
        `, params);
      } catch {
        result = await pool.query(`
          SELECT DATE(TO_TIMESTAMP(block_time)) as date, flow_type, pool,
                 SUM(amount_zat) as total_zat, COUNT(*) as tx_count
          FROM shielded_flows
          WHERE block_time >= $1${poolClause}
          GROUP BY date, flow_type, pool
          ORDER BY date
        `, params);
      }

      const byDate = {};
      for (const r of result.rows) {
        const d = new Date(r.date).toISOString().split('T')[0];
        if (!byDate[d]) byDate[d] = { date: d, shield: 0, deshield: 0, shieldTx: 0, deshieldTx: 0 };
        const zec = Number(r.total_zat) / 1e8;
        if (r.flow_type === 'shield') {
          byDate[d].shield += zec;
          byDate[d].shieldTx += Number(r.tx_count);
        } else {
          byDate[d].deshield += zec;
          byDate[d].deshieldTx += Number(r.tx_count);
        }
      }

      const points = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
      for (const p of points) {
        p.net = p.shield - p.deshield;
      }

      return { period, pool: poolFilter, points };
    });

    res.json({ success: true, ...data });
  } catch (err) {
    console.error('pools/flows error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/pools/turnstile ───────────────────────────────────────────────

router.get('/api/pools/turnstile', async (req, res) => {
  try {
    const since = req.query.since || '2020-01-01';
    const cacheKey = `zcash:pools:turnstile:${since}`;

    const data = await cached(cacheKey, 600, async () => {
      // Try materialized view first
      let summaryResult, timeseriesResult;
      try {
        summaryResult = await pool.query(`
          SELECT
            SUM(deshielded_zat) as total_deshielded,
            SUM(held_zat) as total_held,
            COALESCE(SUM(reshielded_zat), 0) as total_reshielded,
            COALESCE(SUM(exchange_zat), 0) as total_exchange,
            COALESCE(SUM(bridge_zat), 0) as total_bridge,
            COALESCE(SUM(transferred_zat), 0) as total_transferred,
            SUM(tx_count) as total_tx
          FROM turnstile_daily
          WHERE date >= $1::date
        `, [since]);

        timeseriesResult = await pool.query(`
          SELECT date,
                 SUM(deshielded_zat) as deshielded,
                 SUM(held_zat) as held,
                 COALESCE(SUM(reshielded_zat), 0) as reshielded,
                 COALESCE(SUM(exchange_zat), 0) as exchange,
                 COALESCE(SUM(bridge_zat), 0) as bridge,
                 COALESCE(SUM(transferred_zat), 0) as transferred,
                 SUM(tx_count) as tx_count
          FROM turnstile_daily
          WHERE date >= $1::date
          GROUP BY date
          ORDER BY date
        `, [since]);
      } catch {
        summaryResult = await pool.query(`
          WITH deshield_outputs AS (
            SELECT sf.txid, txo.vout_index, txo.value
            FROM shielded_flows sf
            JOIN transaction_outputs txo ON txo.txid = sf.txid
            WHERE sf.flow_type = 'deshield'
              AND txo.address LIKE 't%'
              AND sf.block_time >= EXTRACT(EPOCH FROM $1::date)
          )
          SELECT
            SUM(d.value) as total_deshielded,
            SUM(CASE WHEN ti.prev_txid IS NULL THEN d.value ELSE 0 END) as total_held,
            0 as total_reshielded, 0 as total_exchange, 0 as total_bridge, 0 as total_transferred
          FROM deshield_outputs d
          LEFT JOIN transaction_inputs ti ON ti.prev_txid = d.txid AND ti.prev_vout = d.vout_index
        `, [since]);

        timeseriesResult = { rows: [] };
      }

      const summary = summaryResult.rows[0] || {};
      const totalDeshielded = Number(summary.total_deshielded) || 0;
      const totalHeld = Number(summary.total_held) || 0;
      const totalReshielded = Number(summary.total_reshielded) || 0;
      const totalExchange = Number(summary.total_exchange) || 0;
      const totalBridge = Number(summary.total_bridge) || 0;
      const totalTransferred = Number(summary.total_transferred) || 0;
      const totalMoved = totalReshielded + totalExchange + totalBridge + totalTransferred;

      const timeseries = timeseriesResult.rows.map(r => ({
        date: new Date(r.date).toISOString().split('T')[0],
        deshielded: Number(r.deshielded) / 1e8,
        held: Number(r.held) / 1e8,
        reshielded: Number(r.reshielded) / 1e8,
        exchange: Number(r.exchange) / 1e8,
        bridge: Number(r.bridge) / 1e8,
        transferred: Number(r.transferred) / 1e8,
        txCount: Number(r.tx_count),
      }));

      return {
        since,
        summary: {
          totalDeshielded: totalDeshielded / 1e8,
          totalHeld: totalHeld / 1e8,
          totalReshielded: totalReshielded / 1e8,
          totalExchange: totalExchange / 1e8,
          totalBridge: totalBridge / 1e8,
          totalTransferred: totalTransferred / 1e8,
          totalMoved: totalMoved / 1e8,
          heldPercent: totalDeshielded > 0 ? (totalHeld / totalDeshielded) * 100 : 0,
          reshieldedPercent: totalDeshielded > 0 ? (totalReshielded / totalDeshielded) * 100 : 0,
          exchangePercent: totalDeshielded > 0 ? (totalExchange / totalDeshielded) * 100 : 0,
          bridgePercent: totalDeshielded > 0 ? (totalBridge / totalDeshielded) * 100 : 0,
          transferredPercent: totalDeshielded > 0 ? (totalTransferred / totalDeshielded) * 100 : 0,
          movedPercent: totalDeshielded > 0 ? (totalMoved / totalDeshielded) * 100 : 0,
          txCount: Number(summary.total_tx) || 0,
        },
        timeseries,
      };
    });

    res.json({ success: true, ...data });
  } catch (err) {
    console.error('pools/turnstile error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
