'use strict';

/**
 * CipherScan Data Bot — Daily Digest Job
 *
 * Composes and posts the once-daily chain summary.
 * Dedup key: daily_digest:YYYY-MM-DD
 */

const queries = require('../lib/queries');
const { formatDailyDigest } = require('../lib/formatter');

const SIGNALS_OF_DAY = [
  'cross_chain',
  'mining',
  'fees',
  'privacy',
];

async function run(pool, xClient, { date, logger = console }) {
  const dateStr = date || new Date().toISOString().slice(0, 10);
  const dedupKey = `daily_digest:${dateStr}`;

  if (await queries.isDuplicate(pool, dedupKey)) {
    logger.info(`[DailyDigest] Already posted for ${dateStr}, skipping`);
    return null;
  }

  const [chainTip, avgBlockTime, supplyData, flows, ironwood, compliance] = await Promise.all([
    queries.getChainTip(pool),
    queries.getAvgBlockTime1000(pool),
    queries.getShieldedSupplyShare(pool),
    queries.get24hFlows(pool),
    queries.getIronwoodStats(pool),
    queries.getZip318Compliance(pool),
  ]);

  if (!chainTip) {
    logger.error('[DailyDigest] No chain tip data');
    return null;
  }

  // Rotate signal of the day by day-of-year
  const dayOfYear = Math.floor((Date.now() - new Date(dateStr).setMonth(0, 0)) / 86400000);
  const signalType = SIGNALS_OF_DAY[dayOfYear % SIGNALS_OF_DAY.length];
  let signalOfDay = null;

  try {
    if (signalType === 'cross_chain') {
      const cc = await queries.getCrossChain24h(pool);
      if (cc.swapCount > 0) {
        signalOfDay = `🔄 Cross-chain: ${cc.swapCount} swaps | In: $${Math.round(cc.inflowUsd).toLocaleString()} | Out: $${Math.round(cc.outflowUsd).toLocaleString()}`;
      }
    } else if (signalType === 'mining') {
      const miners = await queries.getMiningSnapshot(pool);
      if (miners.length > 0) {
        const top = miners.slice(0, 3).map(m => `${m.pool_name} ${m.pct_share}%`).join(', ');
        signalOfDay = `⛏ Mining: ${top}`;
      }
    }
  } catch (e) {
    logger.warn(`[DailyDigest] Signal of day (${signalType}) failed: ${e.message}`);
  }

  const content = formatDailyDigest({
    chainTip,
    avgBlockTime,
    shieldedPct: Number(supplyData?.shielded_pct ?? 0),
    flows,
    ironwood,
    compliance,
    signalOfDay,
  });

  const outboxId = await queries.insertOutboxEntry(pool, {
    postType: 'daily_digest',
    dedupKey,
    content,
    metadata: { chainTip, ironwood, compliance, dateStr },
    status: xClient.dryRun ? 'dry_run' : 'pending',
  });

  if (!outboxId) {
    logger.info(`[DailyDigest] Dedup conflict for ${dedupKey}`);
    return null;
  }

  try {
    const result = await xClient.post(content);
    await queries.markPosted(pool, outboxId, result.id);
    logger.info(`[DailyDigest] Posted for ${dateStr}: ${result.id}`);
    return result;
  } catch (err) {
    await queries.markFailed(pool, outboxId, err.message);
    logger.error(`[DailyDigest] Failed: ${err.message}`);
    return null;
  }
}

module.exports = { run };
