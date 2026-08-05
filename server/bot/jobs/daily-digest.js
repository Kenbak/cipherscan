'use strict';

/**
 * CipherScan Data Bot — Daily Digest Job
 *
 * Composes and posts the once-daily chain summary with a branded image card.
 * Dedup key: daily_digest:YYYY-MM-DD
 */

const fs = require('fs');
const queries = require('../lib/queries');
const { formatDailyDigest } = require('../lib/formatter');
const { renderDailyDigest } = require('../lib/card-renderer');

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

  const content = formatDailyDigest({ chainTip, shielded, flows, ironwood, compliance });

  let imagePath = null;
  try {
    imagePath = await renderDailyDigest({ chainTip, shielded, flows, ironwood, compliance });
  } catch (err) {
    logger.warn(`[DailyDigest] Card render failed, posting text-only: ${err.message}`);
  }

  const outboxId = await queries.insertOutboxEntry(pool, {
    postType: 'daily_digest',
    dedupKey,
    content,
    metadata: { chainTip, ironwood, compliance, dateStr },
    status: xClient.dryRun ? 'dry_run' : 'pending',
  });

  if (!outboxId) {
    logger.info(`[DailyDigest] Dedup conflict for ${dedupKey}`);
    cleanup(imagePath);
    return null;
  }

  try {
    const result = imagePath
      ? await xClient.postWithMedia(content, imagePath)
      : await xClient.post(content);
    await queries.markPosted(pool, outboxId, result.id);
    logger.info(`[DailyDigest] Posted for ${dateStr}: ${result.id}`);
    cleanup(imagePath);
    return result;
  } catch (err) {
    await queries.markFailed(pool, outboxId, err.message);
    logger.error(`[DailyDigest] Failed: ${err.message}`);
    cleanup(imagePath);
    return null;
  }
}

function cleanup(filePath) {
  if (filePath) try { fs.unlinkSync(filePath); } catch { /* ignore */ }
}

module.exports = { run };
