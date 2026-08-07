/**
 * Valuation Routes
 *
 * GET /api/valuation/snapshot      — latest MVRV, realized price, SOPR, NUPL
 * GET /api/valuation/history       — time series for charts (from/to/metric)
 * GET /api/valuation/hodl-waves    — HODL-wave buckets (Phase 3)
 * GET /api/valuation/dormancy      — coin-days-destroyed (Phase 3)
 */

const express = require('express');
const router = express.Router();

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

// ─── Snapshot: latest row ─────────────────────────────────────────────────────

router.get('/api/valuation/snapshot', async (req, res) => {
  try {
    const data = await cached('zcash:valuation:snapshot', 600, async () => {
      const { rows } = await pool.query(`
        SELECT m.date, m.market_cap_usd, m.realized_cap_usd,
               m.transparent_realized_cap_usd, m.shielded_realized_cap_usd,
               m.mvrv, m.realized_price, m.sopr, m.nupl,
               p.price_usd
        FROM mvrv_daily m
        LEFT JOIN zec_price_daily p ON p.date = m.date
        ORDER BY m.date DESC LIMIT 1
      `);
      if (!rows[0]) return null;
      const r = rows[0];
      return {
        date: r.date,
        priceUsd: Number(r.price_usd),
        realizedPrice: Number(r.realized_price),
        mvrv: Number(r.mvrv),
        sopr: Number(r.sopr),
        nupl: Number(r.nupl),
        marketCapUsd: Number(r.market_cap_usd),
        realizedCapUsd: Number(r.realized_cap_usd),
        transparentRealizedCapUsd: Number(r.transparent_realized_cap_usd),
        shieldedRealizedCapUsd: Number(r.shielded_realized_cap_usd),
      };
    });

    if (!data) return res.status(503).json({ error: 'Valuation data not available' });
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('valuation/snapshot error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── History: time series ─────────────────────────────────────────────────────

router.get('/api/valuation/history', async (req, res) => {
  try {
    const days = parsePeriod(req.query.period);
    const cacheKey = `zcash:valuation:history:${days}`;

    const data = await cached(cacheKey, 600, async () => {
      const { rows } = await pool.query(`
        SELECT m.date,
               p.price_usd,
               m.realized_price,
               m.mvrv,
               m.sopr,
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

      return rows.map(r => ({
        date: r.date,
        priceUsd: r.price_usd ? Number(r.price_usd) : null,
        realizedPrice: r.realized_price ? Number(r.realized_price) : null,
        mvrv: r.mvrv ? Number(r.mvrv) : null,
        sopr: r.sopr ? Number(r.sopr) : null,
        nupl: r.nupl ? Number(r.nupl) : null,
        marketCapUsd: r.market_cap_usd ? Number(r.market_cap_usd) : null,
        realizedCapUsd: r.realized_cap_usd ? Number(r.realized_cap_usd) : null,
        transparentRealizedCapUsd: r.transparent_realized_cap_usd ? Number(r.transparent_realized_cap_usd) : null,
        shieldedRealizedCapUsd: r.shielded_realized_cap_usd ? Number(r.shielded_realized_cap_usd) : null,
      }));
    });

    res.json({ success: true, period: `${days}d`, points: data });
  } catch (err) {
    console.error('valuation/history error:', err.message);
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
    console.error('valuation/hodl-waves error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Dormancy / CDD ──────────────────────────────────────────────────────────

router.get('/api/valuation/dormancy', async (req, res) => {
  try {
    const days = parsePeriod(req.query.period);
    const cacheKey = `zcash:valuation:dormancy:${days}`;

    const data = await cached(cacheKey, 600, async () => {
      const { rows } = await pool.query(`
        SELECT date, cdd, avg_dormancy_days, spent_count
        FROM utxo_age_daily
        WHERE date >= CURRENT_DATE - $1::int
        ORDER BY date ASC
      `, [days]);

      return rows.map(r => ({
        date: r.date,
        cdd: Number(r.cdd),
        avgDormancy: Number(r.avg_dormancy_days),
        spentCount: Number(r.spent_count),
      }));
    });

    res.json({ success: true, period: `${days}d`, points: data });
  } catch (err) {
    console.error('valuation/dormancy error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
