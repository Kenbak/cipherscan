/**
 * Valuation Routes
 *
 * GET /api/valuation/snapshot      — latest MVRV, realized price, SOPR, NUPL
 * GET /api/valuation/history       — time series for charts (from/to/metric)
 * GET /api/valuation/hodl-waves    — HODL-wave buckets (Phase 3)
 * GET /api/valuation/dormancy      — coin-days-destroyed (Phase 3)
 */

const express = require('express');
const { logSafeError } = require('../lib/safe-log');
const router = express.Router();
const { nullableNumber, valuationRow } = require('../lib/valuation-values');

let pool, redisClient;

router.use((req, res, next) => {
  pool = req.app.locals.pool;
  redisClient = req.app.locals.redisClient;
  next();
});

async function cached(key, ttlSeconds, fn) {
  try {
    if (redisClient?.isOpen) {
      const hit = await redisClient.get(key);
      if (hit) return JSON.parse(hit);
    }
  } catch {}
  const data = await fn();
  try {
    if (redisClient?.isOpen) {
      await redisClient.setEx(key, ttlSeconds, JSON.stringify(data));
    }
  } catch {}
  return data;
}

const VALID_PERIODS = { '30d': 30, '90d': 90, '180d': 180, '1y': 365, '2y': 730, 'all': 9999 };

function parsePeriod(raw) {
  return VALID_PERIODS[raw] || VALID_PERIODS['1y'];
}

// Public read only; importing runs on the server with database credentials.
router.get('/api/valuation/search-interest', async (req, res) => {
  try {
    const { latestSearchInterest } = require('../lib/search-interest');
    const snapshot = await cached('zcash:valuation:search-interest:v1', 300, () => latestSearchInterest(req.app.locals.pool));
    res.json({ success: true, snapshot });
  } catch (error) {
    logSafeError('Search interest unavailable:', error);
    res.status(503).json({ error: 'Search interest temporarily unavailable' });
  }
});

// ─── Snapshot: latest row ─────────────────────────────────────────────────────

router.get('/api/valuation/snapshot', async (req, res) => {
  try {
    const data = await cached('zcash:valuation:v2:snapshot', 600, async () => {
      const { rows } = await pool.query(`
        SELECT m.date, m.market_cap_usd, m.realized_cap_usd,
               m.transparent_realized_cap_usd, m.shielded_realized_cap_usd,
               m.mvrv, m.realized_price,
               m.sopr, m.shielded_sopr, m.nupl,
               p.price_usd
        FROM mvrv_daily m
        LEFT JOIN zec_price_daily p ON p.date = m.date
        ORDER BY m.date DESC LIMIT 1
      `);
      if (!rows[0]) return null;
      const r = rows[0];
      return valuationRow(r);
    });

    if (!data) return res.status(503).json({ error: 'Valuation data not available' });
    res.json({ success: true, ...data });
  } catch (err) {
    logSafeError('valuation/snapshot error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── History: time series ─────────────────────────────────────────────────────

router.get('/api/valuation/history', async (req, res) => {
  try {
    const days = parsePeriod(req.query.period);
    const cacheKey = `zcash:valuation:v2:history:${days}`;

    const data = await cached(cacheKey, 600, async () => {
      const { rows } = await pool.query(`
        SELECT m.date,
               p.price_usd,
               m.realized_price,
               m.mvrv,
               m.sopr, m.shielded_sopr,
               m.nupl,
               m.market_cap_usd,
               m.realized_cap_usd,
               m.transparent_realized_cap_usd,
               m.shielded_realized_cap_usd
        FROM mvrv_daily m
        LEFT JOIN zec_price_daily p ON p.date = m.date
        WHERE m.date >= CURRENT_DATE - $1::int
        ORDER BY m.date ASC
      `, [days]);

      return rows.map(valuationRow);
    });

    res.json({ success: true, period: `${days}d`, points: data });
  } catch (err) {
    logSafeError('valuation/history error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── HODL Waves: stacked area data ────────────────────────────────────────────

router.get('/api/valuation/hodl-waves', async (req, res) => {
  try {
    const days = parsePeriod(req.query.period);
    const cacheKey = `zcash:valuation:hodl-waves:${days}`;

    const data = await cached(cacheKey, 600, async () => {
      const { rows } = await pool.query(`
        SELECT date,
               lt_1m_zat, b_1_3m_zat, b_3_6m_zat,
               b_6_12m_zat, b_1_2y_zat, gt_2y_zat,
               total_unspent_zat, utxo_count
        FROM utxo_age_daily
        WHERE date >= CURRENT_DATE - $1::int
        ORDER BY date ASC
      `, [days]);

      return rows.map(r => ({
        date: r.date,
        lt1m: Number(r.lt_1m_zat) / 1e8,
        b1_3m: Number(r.b_1_3m_zat) / 1e8,
        b3_6m: Number(r.b_3_6m_zat) / 1e8,
        b6_12m: Number(r.b_6_12m_zat) / 1e8,
        b1_2y: Number(r.b_1_2y_zat) / 1e8,
        gt2y: Number(r.gt_2y_zat) / 1e8,
        total: Number(r.total_unspent_zat) / 1e8,
        utxoCount: Number(r.utxo_count),
      }));
    });

    res.json({ success: true, period: `${days}d`, points: data });
  } catch (err) {
    logSafeError('valuation/hodl-waves error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Dormancy / CDD ──────────────────────────────────────────────────────────

router.get('/api/valuation/dormancy', async (req, res) => {
  try {
    const days = parsePeriod(req.query.period);
    const cacheKey = `zcash:valuation:v2:dormancy:${days}`;

    const data = await cached(cacheKey, 600, async () => {
      const { rows } = await pool.query(`
        SELECT date, cdd, avg_dormancy_days, spent_count
        FROM utxo_age_daily
        WHERE date >= CURRENT_DATE - $1::int
        ORDER BY date ASC
      `, [days]);

      return rows.map(r => ({
        date: r.date,
        cdd: nullableNumber(r.cdd),
        avgDormancy: nullableNumber(r.avg_dormancy_days),
        spentCount: nullableNumber(r.spent_count),
      }));
    });

    res.json({ success: true, period: `${days}d`, points: data });
  } catch (err) {
    logSafeError('valuation/dormancy error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
