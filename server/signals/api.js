/**
 * Trading Signals — Paid API Route (x402 / CipherPay)
 *
 * Endpoints:
 *   GET /api/signals/latest      — current signal + last 7 days
 *   GET /api/signals/history     — full signal history (optional ?days=90)
 *   GET /api/signals/performance — backtest summary stats
 *
 * Authentication (priority order):
 *   1. X-Service-Key header (admin bypass for Telegram bot / internal)
 *   2. Authorization: Bearer cps_... (CipherPay session — 24h unlimited)
 *   3. Authorization: Payment <credential> (x402/MPP one-time payment)
 *   4. No auth → 402 Payment Required
 *
 * Privacy: txids are never logged or persisted by this service.
 * Fixed denomination (0.001 ZEC) for anonymity set.
 */

const { Router } = require('express');
const router = Router();

// x402 paywall — loaded asynchronously (ESM module in CJS context)
let paywall = null;

(async () => {
  const address = process.env.CIPHERPAY_PAYOUT_ADDRESS;
  const apiKey = process.env.CIPHERPAY_API_KEY;

  if (!address || !apiKey) {
    console.warn('[signals] CIPHERPAY_PAYOUT_ADDRESS or CIPHERPAY_API_KEY not set — paywall disabled, service-key only');
    return;
  }

  try {
    const { zcashPaywall } = await import('@cipherpay/x402/express');
    paywall = zcashPaywall({
      address,
      apiKey,
      description: 'CipherScan Trading Signals — 24h access',
      amount: 0.001,
      protocol: 'both',
    });
    console.log('[signals] x402 paywall initialized (0.001 ZEC / 24h session)');
  } catch (err) {
    console.error('[signals] x402 paywall failed to load:', err.message);
  }
})();

// Dual-auth middleware: admin key bypass → x402 paywall → 503 if not ready
function authMiddleware(req, res, next) {
  const serviceKey = req.headers['x-service-key'];
  const expected = process.env.SIGNALS_API_KEY;
  if (expected && serviceKey === expected) {
    return next();
  }

  if (!paywall) {
    if (!process.env.CIPHERPAY_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(503).json({
      error: 'Payment service initializing. Try again in a few seconds.',
    });
  }

  return paywall(req, res, next);
}

router.use(authMiddleware);

router.get('/latest', async (req, res) => {
  try {
    const result = await req.app.locals.pool.query(`
      SELECT signal_date, svr_7d, svr_30d, pool_momentum, miner_pressure,
             crosschain_flow, shielded_tx_momentum, composite_score, signal,
             price_usd, shielded_pool_pct
      FROM trading_signals
      ORDER BY signal_date DESC
      LIMIT 7
    `);

    if (result.rows.length === 0) {
      return res.json({ signal: null, message: 'No signals computed yet' });
    }

    const latest = result.rows[0];
    const history = result.rows;

    // Trend: is the composite improving or declining?
    let trend = 'stable';
    if (history.length >= 3) {
      const recent = Number(history[0].composite_score);
      const prior = Number(history[2].composite_score);
      if (recent - prior > 10) trend = 'improving';
      else if (prior - recent > 10) trend = 'declining';
    }

    res.json({
      current: {
        date: latest.signal_date,
        signal: latest.signal,
        composite: Number(latest.composite_score),
        indicators: {
          svr_7d: latest.svr_7d ? Number(latest.svr_7d) : null,
          svr_30d: latest.svr_30d ? Number(latest.svr_30d) : null,
          pool_momentum: latest.pool_momentum ? Number(latest.pool_momentum) : null,
          miner_pressure: latest.miner_pressure ? Number(latest.miner_pressure) : null,
          crosschain_flow: latest.crosschain_flow ? Number(latest.crosschain_flow) : null,
          shielded_tx_momentum: latest.shielded_tx_momentum ? Number(latest.shielded_tx_momentum) : null,
        },
        price: latest.price_usd ? Number(latest.price_usd) : null,
        shielded_pct: latest.shielded_pool_pct ? Number(latest.shielded_pool_pct) : null,
      },
      trend,
      history: history.map(r => ({
        date: r.signal_date,
        signal: r.signal,
        composite: Number(r.composite_score),
        price: r.price_usd ? Number(r.price_usd) : null,
      })),
    });
  } catch (err) {
    console.error('[signals/api]', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/history', async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 90, 400);

    const result = await req.app.locals.pool.query(`
      SELECT signal_date, svr_7d, svr_30d, pool_momentum, miner_pressure,
             crosschain_flow, shielded_tx_momentum, composite_score, signal,
             price_usd, shielded_pool_pct
      FROM trading_signals
      WHERE signal_date >= CURRENT_DATE - ($1 || ' days')::interval
      ORDER BY signal_date DESC
    `, [days]);

    res.json({
      count: result.rows.length,
      signals: result.rows.map(r => ({
        date: r.signal_date,
        signal: r.signal,
        composite: Number(r.composite_score),
        svr_7d: r.svr_7d ? Number(r.svr_7d) : null,
        svr_30d: r.svr_30d ? Number(r.svr_30d) : null,
        pool_momentum: r.pool_momentum ? Number(r.pool_momentum) : null,
        miner_pressure: r.miner_pressure ? Number(r.miner_pressure) : null,
        crosschain_flow: r.crosschain_flow ? Number(r.crosschain_flow) : null,
        shielded_tx_momentum: r.shielded_tx_momentum ? Number(r.shielded_tx_momentum) : null,
        price: r.price_usd ? Number(r.price_usd) : null,
        shielded_pct: r.shielded_pool_pct ? Number(r.shielded_pool_pct) : null,
      })),
    });
  } catch (err) {
    console.error('[signals/api]', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/performance', async (req, res) => {
  try {
    const horizon = Math.min(parseInt(req.query.horizon) || 7, 30);

    const result = await req.app.locals.pool.query(`
      SELECT
        s.signal,
        COUNT(*) as count,
        AVG(((future.price_usd - s.price_usd) / s.price_usd) * 100) as avg_return,
        STDDEV(((future.price_usd - s.price_usd) / s.price_usd) * 100) as std_return
      FROM trading_signals s
      JOIN zec_price_daily future
        ON future.date = s.signal_date + ($1 || ' days')::interval
      WHERE s.price_usd > 0
      GROUP BY s.signal
      ORDER BY avg_return DESC
    `, [horizon]);

    res.json({
      horizon_days: horizon,
      performance: result.rows.map(r => ({
        signal: r.signal,
        count: Number(r.count),
        avg_return_pct: r.avg_return ? Number(Number(r.avg_return).toFixed(2)) : 0,
        std_return_pct: r.std_return ? Number(Number(r.std_return).toFixed(2)) : 0,
      })),
    });
  } catch (err) {
    console.error('[signals/api]', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;
