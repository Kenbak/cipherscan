'use strict';

/**
 * CipherScan Data Bot — Daily Digest Job
 *
 * Composes and posts the once-daily chain summary.
 * Dedup key: daily_digest:YYYY-MM-DD
 */

const queries = require('../lib/queries');
const { formatDailyDigest } = require('../lib/formatter');

async function run(pool, xClient, { date, logger = console }) {
  const dateStr = date || new Date().toISOString().slice(0, 10);
  const dedupKey = `daily_digest:${dateStr}`;

  if (await queries.isDuplicate(pool, dedupKey)) {
    logger.info(`[DailyDigest] Already posted for ${dateStr}, skipping`);
    return null;
  }

  const [chainTip, shielded, flows, ironwood, compliance] = await Promise.all([
    queries.getChainTip(pool),
    queries.getShieldedSupplyShare(pool),
    queries.get24hFlows(pool),
    queries.getIronwoodStats(pool),
    queries.getZip318Compliance(pool),
  ]);

  if (!chainTip) {
    logger.error('[DailyDigest] No chain tip data');
    return null;
  }

  const content = formatDailyDigest({
    chainTip,
    shielded,
    flows,
    ironwood,
    compliance,
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
