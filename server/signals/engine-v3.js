'use strict';

/**
 * Quant Signal Engine V3 — MVRV-Anchored
 *
 * Architecture:
 *   Layer 1 — Valuation (MVRV, NUPL, Shielded SOPR): "Is it cheap?"
 *   Layer 2 — Flow Timing (deshield spikes, whale exits, exchange routing): "Is something happening?"
 *   Layer 3 — Best V2 (pool momentum, cross-chain, mean reversion): "Does context confirm?"
 *
 * Signal = valuation_score * flow_timing_multiplier * context_weight
 * Output: -100 to +100 composite, confidence %, regime, and individual breakdowns
 *
 * Usage:
 *   node server/signals/engine-v3.js                # today
 *   node server/signals/engine-v3.js --date 2026-08-01
 *   node server/signals/engine-v3.js --backfill     # all dates
 */

const { loadEnv } = require('../lib/job-utils');
const { getPool, getReadPool } = require('../lib/db-pool');

loadEnv(__dirname);
const indicators = require('./indicators');

const pgPool = getPool();
// computeValuationScore/computeFlowTimingScore/computeContextScore/
// detectRegime are all read-only. Only upsertV3Signal (CREATE TABLE +
// INSERT), which runs strictly after a signal is fully computed, writes —
// so every read in the compute path is safe to offload to the replica.
const readPool = getReadPool();

// --- V3 Configuration ---

const V3_CONFIG = {
  // Layer weights
  layerWeights: {
    valuation: 0.45,
    flowTiming: 0.30,
    context: 0.25,
  },

  // MVRV zones (based on Zcash-specific research + Bitcoin analogs)
  mvrv: {
    deepValue: 0.3,       // Historically extreme buy (ZEC-specific)
    value: 0.6,           // Clearly undervalued
    fair: 1.0,            // Fair value (at realized price)
    overheated: 1.3,      // Getting expensive for ZEC
    euphoria: 1.6,        // Historically near tops for ZEC
  },

  // Shielded SOPR thresholds
  sopr: {
    capitulation: 0.7,    // Holders selling at steep loss
    pain: 0.9,            // Mild loss-taking
    neutral: 1.1,         // Break even zone
    profit: 1.4,          // Healthy profit-taking
    euphoria: 1.7,        // Extreme unrealized gains
  },

  // Flow pattern thresholds (from research: >2σ = significant)
  flowPatterns: {
    deshieldSpikeWindow: 30,
    deshieldSigmaThreshold: 2.0,
    whaleDeshieldMinZat: 100000000000, // 1000 ZEC
    exchangeRoutingLookback: 14,
  },

  // Regime detection
  regime: {
    smaDays: 30,
    slopeThreshold: 0.005,
    volHighThreshold: 0.04,
  },

  // Signal thresholds
  thresholds: {
    strongBuy: 55,
    buy: 25,
    sell: -25,
    strongSell: -55,
  },
};

// --- Layer 1: Valuation Score ---

async function computeValuationScore(targetDate) {
  const { rows: [mvrv] } = await readPool.query(
    `SELECT mvrv, shielded_sopr, nupl, realized_price FROM mvrv_daily WHERE date = $1`,
    [targetDate]
  );

  if (!mvrv || !mvrv.mvrv) return { score: null, components: {} };

  const mvrvVal = parseFloat(mvrv.mvrv);
  const sopr = parseFloat(mvrv.shielded_sopr) || 1;
  const nupl = parseFloat(mvrv.nupl) || 0;

  // MVRV score: recalibrated for ZEC actual range (0.05-1.8)
  const { deepValue, value, fair, overheated, euphoria } = V3_CONFIG.mvrv;
  let mvrvScore;
  if (mvrvVal <= deepValue) mvrvScore = 100;
  else if (mvrvVal <= value) mvrvScore = linearScale(mvrvVal, deepValue, value, 100, 50);
  else if (mvrvVal <= fair) mvrvScore = linearScale(mvrvVal, value, fair, 50, 0);
  else if (mvrvVal <= overheated) mvrvScore = linearScale(mvrvVal, fair, overheated, 0, -50);
  else if (mvrvVal <= euphoria) mvrvScore = linearScale(mvrvVal, overheated, euphoria, -50, -90);
  else mvrvScore = -100;

  // MVRV momentum: 7d change (rising = bearish, falling = bullish)
  const { rows: [prevMvrv] } = await readPool.query(
    `SELECT mvrv FROM mvrv_daily WHERE date = ($1::date - '7 days'::interval)`,
    [targetDate]
  );
  let mvrvMomentumScore = 0;
  if (prevMvrv && prevMvrv.mvrv) {
    const prevVal = parseFloat(prevMvrv.mvrv);
    const change = mvrvVal - prevVal;
    mvrvMomentumScore = clamp(Math.round(-change * 200), -50, 50);
  }

  // SOPR score: capitulation = buy, euphoria = sell
  const { capitulation, pain, neutral, profit, euphoria: soprEuphoria } = V3_CONFIG.sopr;
  let soprScore;
  if (sopr <= capitulation) soprScore = 80;
  else if (sopr <= pain) soprScore = linearScale(sopr, capitulation, pain, 80, 30);
  else if (sopr <= neutral) soprScore = linearScale(sopr, pain, neutral, 30, 0);
  else if (sopr <= profit) soprScore = linearScale(sopr, neutral, profit, 0, -40);
  else if (sopr <= soprEuphoria) soprScore = linearScale(sopr, profit, soprEuphoria, -40, -80);
  else soprScore = -100;

  // NUPL score
  let nuplScore;
  if (nupl < -0.1) nuplScore = 80;
  else if (nupl < 0) nuplScore = linearScale(nupl, -0.1, 0, 80, 30);
  else if (nupl < 0.15) nuplScore = linearScale(nupl, 0, 0.15, 30, 0);
  else if (nupl < 0.3) nuplScore = linearScale(nupl, 0.15, 0.3, 0, -40);
  else if (nupl < 0.5) nuplScore = linearScale(nupl, 0.3, 0.5, -40, -80);
  else nuplScore = -100;

  // Weighted: MVRV level + momentum + SOPR + NUPL
  const score = Math.round(mvrvScore * 0.35 + mvrvMomentumScore * 0.20 + soprScore * 0.25 + nuplScore * 0.20);

  return {
    score: clamp(score, -100, 100),
    components: {
      mvrv: mvrvVal,
      mvrv_score: Math.round(mvrvScore),
      mvrv_momentum: mvrvMomentumScore,
      sopr,
      sopr_score: Math.round(soprScore),
      nupl,
      nupl_score: Math.round(nuplScore),
      realized_price: parseFloat(mvrv.realized_price) || 0,
    },
  };
}

// --- Layer 2: Flow Timing Score ---

async function computeFlowTimingScore(targetDate) {
  const { deshieldSpikeWindow, deshieldSigmaThreshold, whaleDeshieldMinZat, exchangeRoutingLookback } = V3_CONFIG.flowPatterns;

  // 1. Deshield volume spike detection (2σ above 30d mean → bullish per research)
  const { rows: deshieldRows } = await readPool.query(`
    SELECT to_char(to_timestamp(block_time)::date, 'YYYY-MM-DD') as date,
           SUM(amount_zat)::float / 1e8 as deshield_zec
    FROM shielded_flows
    WHERE flow_type = 'deshield'
      AND block_time >= EXTRACT(EPOCH FROM ($1::date - ($2 || ' days')::interval))
      AND block_time < EXTRACT(EPOCH FROM ($1::date + '1 day'::interval))
      AND block_time IS NOT NULL
    GROUP BY 1 ORDER BY 1
  `, [targetDate, deshieldSpikeWindow]);

  let deshieldScore = 0;
  if (deshieldRows.length >= 20) {
    const values = deshieldRows.map(r => parseFloat(r.deshield_zec));
    const today = values[values.length - 1] || 0;
    const window = values.slice(0, -1);
    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const std = Math.sqrt(window.reduce((a, v) => a + (v - mean) ** 2, 0) / window.length);
    if (std > 0) {
      const zScore = (today - mean) / std;
      // Research: >2σ spike → +2.89% 7d return (bullish)
      // Quiet (<-1σ) → -0.97% 3d return (bearish)
      if (zScore > deshieldSigmaThreshold) deshieldScore = Math.min(80, Math.round(zScore * 30));
      else if (zScore < -1) deshieldScore = Math.max(-50, Math.round(zScore * 25));
    }
  }

  // 2. Whale deshield detection (>1000 ZEC single tx → bullish per research)
  const { rows: [whaleRow] } = await readPool.query(`
    SELECT COUNT(*) as whale_count, COALESCE(SUM(amount_zat), 0)::float / 1e8 as whale_zec
    FROM shielded_flows
    WHERE flow_type = 'deshield'
      AND amount_zat >= $1
      AND block_time >= EXTRACT(EPOCH FROM ($2::date))
      AND block_time < EXTRACT(EPOCH FROM ($2::date + '1 day'::interval))
  `, [whaleDeshieldMinZat, targetDate]);

  let whaleScore = 0;
  const whaleCount = parseInt(whaleRow.whale_count);
  if (whaleCount > 0) {
    // Research: whale deshield days → +2.27% 7d return
    whaleScore = Math.min(60, whaleCount * 20);
  }

  // 3. Exchange routing ratio (low = very bullish per research: +6.18% 7d, t=3.03)
  const { rows: [routingRow] } = await readPool.query(`
    SELECT
      COALESCE(SUM(exchange_zat), 0)::float as exchange,
      COALESCE(SUM(deshielded_zat), 0)::float as total_deshield
    FROM turnstile_daily
    WHERE date >= ($1::date - ($2 || ' days')::interval)
      AND date <= $1::date
  `, [targetDate, exchangeRoutingLookback]);

  let routingScore = 0;
  if (routingRow && parseFloat(routingRow.total_deshield) > 0) {
    const ratio = parseFloat(routingRow.exchange) / parseFloat(routingRow.total_deshield);
    // Low ratio = deshield NOT going to exchanges = bullish
    // Research shows low exchange routing → +6.18% 7d (strongest signal found)
    if (ratio < 0.15) routingScore = 70;
    else if (ratio < 0.25) routingScore = 40;
    else if (ratio < 0.40) routingScore = 0;
    else if (ratio < 0.60) routingScore = -30;
    else routingScore = -60;
  }

  // Composite flow timing: weighted by research significance
  const score = Math.round(
    deshieldScore * 0.35 +
    routingScore * 0.40 +  // Strongest signal (t=3.03)
    whaleScore * 0.25
  );

  return {
    score: clamp(score, -100, 100),
    components: {
      deshield_spike: deshieldScore,
      whale_deshield: whaleScore,
      exchange_routing: routingScore,
      whale_count: whaleCount,
    },
  };
}

// --- Layer 3: Context (Best V2 Indicators) ---

async function computeContextScore(targetDate) {
  const [poolMom, crossFlow, meanRev, netMom, svr7] = await Promise.all([
    indicators.computePoolMomentum(readPool, targetDate),
    indicators.computeCrosschainFlow(readPool, targetDate),
    indicators.computeMeanReversion(readPool, targetDate),
    indicators.computeNetworkMomentum(readPool, targetDate),
    indicators.computeSVR(readPool, targetDate, 7),
  ]);

  const scores = { pool_momentum: poolMom, crosschain_flow: crossFlow, mean_reversion: meanRev, network_momentum: netMom, svr_7d: svr7 };
  const nonNull = Object.values(scores).filter(v => v !== null);
  if (nonNull.length === 0) return { score: null, components: scores };

  // Equal weight among available context indicators
  const avg = Math.round(nonNull.reduce((a, b) => a + b, 0) / nonNull.length);

  return { score: clamp(avg, -100, 100), components: scores };
}

// --- Regime Detection ---

async function detectRegime(targetDate) {
  const { smaDays, slopeThreshold, volHighThreshold } = V3_CONFIG.regime;

  const { rows } = await readPool.query(`
    SELECT price_usd FROM zec_price_daily
    WHERE date >= ($1::date - ($2 || ' days')::interval) AND date <= $1::date
    ORDER BY date ASC
  `, [targetDate, smaDays]);

  if (rows.length < smaDays * 0.7) return 'RANGE';

  const prices = rows.map(r => Number(r.price_usd));
  const n = prices.length;
  const xMean = (n - 1) / 2;
  const yMean = prices.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (prices[i] - yMean);
    den += (i - xMean) ** 2;
  }
  const slope = den > 0 ? num / den : 0;
  const normalizedSlope = slope / yMean;

  const returns = [];
  for (let i = 1; i < prices.length; i++) returns.push((prices[i] - prices[i-1]) / prices[i-1]);
  const retMean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const vol = Math.sqrt(returns.reduce((a, r) => a + (r - retMean) ** 2, 0) / returns.length);

  if (normalizedSlope > slopeThreshold && vol < volHighThreshold) return 'BULL';
  if (normalizedSlope < -slopeThreshold && vol < volHighThreshold) return 'BEAR';
  return 'RANGE';
}

// --- Main Composite ---

async function computeV3Signal(targetDate) {
  const [valuation, flowTiming, context, regime] = await Promise.all([
    computeValuationScore(targetDate),
    computeFlowTimingScore(targetDate),
    computeContextScore(targetDate),
    detectRegime(targetDate),
  ]);

  // Get price
  const { rows: [priceRow] } = await readPool.query(
    `SELECT price_usd FROM zec_price_daily WHERE date = $1`, [targetDate]
  );
  const price = priceRow ? parseFloat(priceRow.price_usd) : null;

  // Composite: weighted by layer
  const { valuation: vW, flowTiming: fW, context: cW } = V3_CONFIG.layerWeights;
  const scores = [];
  const weights = [];

  if (valuation.score !== null) { scores.push(valuation.score); weights.push(vW); }
  if (flowTiming.score !== null) { scores.push(flowTiming.score); weights.push(fW); }
  if (context.score !== null) { scores.push(context.score); weights.push(cW); }

  let composite = 0;
  if (weights.length > 0) {
    const totalW = weights.reduce((a, b) => a + b, 0);
    composite = scores.reduce((sum, s, i) => sum + s * weights[i], 0) / totalW;
  }

  // Regime-based suppression
  if (regime === 'BULL' && composite < -30) composite *= 0.5;
  if (regime === 'BEAR' && composite > 30) composite *= 0.5;

  composite = Math.round(clamp(composite, -100, 100));

  // Signal classification
  const { strongBuy, buy, sell, strongSell } = V3_CONFIG.thresholds;
  let signal;
  if (composite >= strongBuy) signal = 'STRONG_BUY';
  else if (composite >= buy) signal = 'BUY';
  else if (composite <= strongSell) signal = 'STRONG_SELL';
  else if (composite <= sell) signal = 'SELL';
  else signal = 'HOLD';

  // Confidence: how many layers agree?
  const layerDirections = [valuation.score, flowTiming.score, context.score]
    .filter(s => s !== null)
    .map(s => s > 10 ? 1 : s < -10 ? -1 : 0);
  const agreement = layerDirections.length > 0
    ? Math.abs(layerDirections.reduce((a, b) => a + b, 0)) / layerDirections.length
    : 0;
  const confidence = Math.round(agreement * 80 + 20); // 20-100 range

  return {
    date: targetDate,
    price,
    composite,
    signal,
    regime,
    confidence,
    valuation,
    flowTiming,
    context,
  };
}

// --- Persistence ---

async function upsertV3Signal(result) {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS trading_signals_v3 (
      date DATE PRIMARY KEY,
      price_usd NUMERIC,
      composite_score INTEGER,
      signal TEXT,
      regime TEXT,
      confidence INTEGER,
      valuation_score INTEGER,
      valuation_mvrv NUMERIC,
      valuation_sopr NUMERIC,
      valuation_nupl NUMERIC,
      flow_timing_score INTEGER,
      flow_deshield_spike INTEGER,
      flow_whale_deshield INTEGER,
      flow_exchange_routing INTEGER,
      context_score INTEGER,
      context_pool_momentum INTEGER,
      context_crosschain INTEGER,
      context_mean_reversion INTEGER,
      context_network_momentum INTEGER,
      context_svr_7d INTEGER,
      computed_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pgPool.query(`
    INSERT INTO trading_signals_v3 (
      date, price_usd, composite_score, signal, regime, confidence,
      valuation_score, valuation_mvrv, valuation_sopr, valuation_nupl,
      flow_timing_score, flow_deshield_spike, flow_whale_deshield, flow_exchange_routing,
      context_score, context_pool_momentum, context_crosschain,
      context_mean_reversion, context_network_momentum, context_svr_7d
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
    ON CONFLICT (date) DO UPDATE SET
      price_usd=EXCLUDED.price_usd, composite_score=EXCLUDED.composite_score,
      signal=EXCLUDED.signal, regime=EXCLUDED.regime, confidence=EXCLUDED.confidence,
      valuation_score=EXCLUDED.valuation_score, valuation_mvrv=EXCLUDED.valuation_mvrv,
      valuation_sopr=EXCLUDED.valuation_sopr, valuation_nupl=EXCLUDED.valuation_nupl,
      flow_timing_score=EXCLUDED.flow_timing_score, flow_deshield_spike=EXCLUDED.flow_deshield_spike,
      flow_whale_deshield=EXCLUDED.flow_whale_deshield, flow_exchange_routing=EXCLUDED.flow_exchange_routing,
      context_score=EXCLUDED.context_score, context_pool_momentum=EXCLUDED.context_pool_momentum,
      context_crosschain=EXCLUDED.context_crosschain, context_mean_reversion=EXCLUDED.context_mean_reversion,
      context_network_momentum=EXCLUDED.context_network_momentum, context_svr_7d=EXCLUDED.context_svr_7d,
      computed_at=NOW()
  `, [
    result.date, result.price, result.composite, result.signal, result.regime, result.confidence,
    result.valuation.score, result.valuation.components.mvrv, result.valuation.components.sopr, result.valuation.components.nupl,
    result.flowTiming.score, result.flowTiming.components.deshield_spike, result.flowTiming.components.whale_deshield, result.flowTiming.components.exchange_routing,
    result.context.score, result.context.components.pool_momentum, result.context.components.crosschain_flow,
    result.context.components.mean_reversion, result.context.components.network_momentum, result.context.components.svr_7d,
  ]);
}

// --- CLI ---

async function main() {
  const args = process.argv.slice(2);
  const isBackfill = args.includes('--backfill');
  const dateIdx = args.indexOf('--date');
  const specificDate = dateIdx >= 0 ? args[dateIdx + 1] : null;

  if (isBackfill) {
    const { rows: dates } = await readPool.query(`
      SELECT DISTINCT date FROM mvrv_daily ORDER BY date
    `);
    console.log(`[V3] Backfilling ${dates.length} dates...`);

    let count = 0;
    const startTime = Date.now();
    for (const { date } of dates) {
      const d = date instanceof Date ? date.toISOString().split('T')[0] : String(date);
      try {
        const result = await computeV3Signal(d);
        await upsertV3Signal(result);
        count++;
        if (count % 100 === 0) {
          const elapsed = (Date.now() - startTime) / 1000;
          console.log(`  ${count}/${dates.length} (${(count/dates.length*100).toFixed(0)}%) — ${Math.round(count/elapsed)}/s | Last: ${result.signal} (${result.composite}) [${result.regime}]`);
        }
      } catch (err) {
        if (count < 5) console.error(`  Error on ${d}: ${err.message}`);
      }
    }
    console.log(`\n[V3] Done! ${count} signals computed in ${((Date.now()-startTime)/1000).toFixed(0)}s`);
  } else {
    const targetDate = specificDate || new Date().toISOString().split('T')[0];
    const result = await computeV3Signal(targetDate);
    await upsertV3Signal(result);

    console.log(`\n[V3 Signal] ${result.date}`);
    console.log(`  Price: $${result.price?.toFixed(2) || '?'}`);
    console.log(`  Signal: ${result.signal} (${result.composite}) | Regime: ${result.regime} | Confidence: ${result.confidence}%`);
    console.log(`  --- Valuation (${result.valuation.score}) ---`);
    console.log(`    MVRV: ${result.valuation.components.mvrv?.toFixed(3)} → score ${result.valuation.components.mvrv_score}`);
    console.log(`    SOPR: ${result.valuation.components.sopr?.toFixed(3)} → score ${result.valuation.components.sopr_score}`);
    console.log(`    NUPL: ${(result.valuation.components.nupl*100)?.toFixed(1)}% → score ${result.valuation.components.nupl_score}`);
    console.log(`    Realized Price: $${result.valuation.components.realized_price?.toFixed(2)}`);
    console.log(`  --- Flow Timing (${result.flowTiming.score}) ---`);
    console.log(`    Deshield spike: ${result.flowTiming.components.deshield_spike}`);
    console.log(`    Whale deshields: ${result.flowTiming.components.whale_deshield} (${result.flowTiming.components.whale_count} txs)`);
    console.log(`    Exchange routing: ${result.flowTiming.components.exchange_routing}`);
    console.log(`  --- Context (${result.context.score}) ---`);
    console.log(`    Pool momentum: ${result.context.components.pool_momentum}`);
    console.log(`    Cross-chain: ${result.context.components.crosschain_flow}`);
    console.log(`    Mean reversion: ${result.context.components.mean_reversion}`);
    console.log(`    Network momentum: ${result.context.components.network_momentum}`);
    console.log(`    SVR-7d: ${result.context.components.svr_7d}`);
  }

  await pgPool.end();
  if (readPool !== pgPool) await readPool.end();
}

// Utility
function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }
function linearScale(value, inMin, inMax, outMin, outMax) {
  if (inMax === inMin) return outMin;
  return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
}

module.exports = { computeV3Signal };

if (require.main === module) {
  main().catch(err => { console.error('Fatal:', err); process.exit(1); });
}
