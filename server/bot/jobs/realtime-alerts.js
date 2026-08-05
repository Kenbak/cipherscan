'use strict';

/**
 * CipherScan Data Bot — Real-time Alerts Job
 *
 * Checks for exceptional events and posts alerts.
 * Runs every ~5 minutes via the orchestrator.
 *
 * Alert types:
 *  - Large shield/deshield (adaptive percentile + absolute floor)
 *  - Ironwood milestones (volume, count, supply %, compliance)
 *  - Chain reorgs (depth >= 2)
 */

const queries = require('../lib/queries');
const { DEFAULT_CONFIG, isExceptionalFlow, checkMilestone, computePercentileRank } = require('../lib/thresholds');
const { formatLargeFlowAlert, formatIronwoodMilestone, formatReorgAlert } = require('../lib/formatter');

async function run(pool, xClient, { logger = console, config = DEFAULT_CONFIG } = {}) {
  const results = [];

  // ─── 1. Large flow alerts ────────────────────────────────────────────────
  try {
    const rollingThreshold = await queries.getFlowPercentile(pool, {
      percentile: config.largeFlow.percentile,
      windowDays: config.largeFlow.windowDays,
    });

    const since = Math.floor(Date.now() / 1000) - 300; // last 5 minutes
    const largeFlows = await queries.getLargeFlows(pool, {
      minZat: Math.min(config.largeFlow.absoluteFloorZat, rollingThreshold),
      since,
    });

    for (const flow of largeFlows) {
      const check = isExceptionalFlow(flow.amountZat, {
        absoluteFloorZat: config.largeFlow.absoluteFloorZat,
        rollingThresholdZat: rollingThreshold,
      });

      if (!check.triggered) continue;

      const dedupKey = `large_flow:${flow.txid}`;
      if (await queries.isDuplicate(pool, dedupKey)) continue;

      const percentileRank = computePercentileRank(
        flow.amountZat, rollingThreshold, config.largeFlow.percentile
      );

      const content = formatLargeFlowAlert({
        direction: flow.direction,
        amountZat: flow.amountZat,
        pool: flow.pool,
        blockHeight: flow.blockHeight,
        txid: flow.txid,
        percentileRank,
      });

      const outboxId = await queries.insertOutboxEntry(pool, {
        postType: 'shield_alert',
        dedupKey,
        content,
        metadata: { ...flow, percentileRank, threshold: rollingThreshold },
        status: xClient.dryRun ? 'dry_run' : 'pending',
      });

      if (outboxId) {
        try {
          const result = await xClient.post(content);
          await queries.markPosted(pool, outboxId, result.id);
          results.push({ type: 'large_flow', txid: flow.txid, postId: result.id });
        } catch (err) {
          await queries.markFailed(pool, outboxId, err.message);
        }
      }
    }
  } catch (err) {
    logger.error(`[Alerts] Large flow check failed: ${err.message}`);
  }

  // ─── 2. Ironwood milestones ──────────────────────────────────────────────
  try {
    const ironwood = await queries.getIronwoodStats(pool);
    const milestoneConfig = config.ironwoodMilestones;

    const volumeZec = ironwood.totalVolumeZat / 1e8;
    const volumeMilestone = checkMilestone(volumeZec, milestoneConfig.volumeSteps);
    if (volumeMilestone) {
      const dedupKey = `milestone:volume:${volumeMilestone}`;
      if (!(await queries.isDuplicate(pool, dedupKey))) {
        const content = formatIronwoodMilestone({
          type: 'volume',
          value: volumeMilestone,
          context: `${ironwood.totalMigrations.toLocaleString()} total migrations`,
        });
        const outboxId = await queries.insertOutboxEntry(pool, {
          postType: 'milestone',
          dedupKey,
          content,
          metadata: { volumeZec, totalMigrations: ironwood.totalMigrations },
          status: xClient.dryRun ? 'dry_run' : 'pending',
        });
        if (outboxId) {
          try {
            const result = await xClient.post(content);
            await queries.markPosted(pool, outboxId, result.id);
            results.push({ type: 'milestone', milestone: `volume:${volumeMilestone}`, postId: result.id });
          } catch (err) {
            await queries.markFailed(pool, outboxId, err.message);
          }
        }
      }
    }

    const countMilestone = checkMilestone(ironwood.totalMigrations, milestoneConfig.countSteps);
    if (countMilestone) {
      const dedupKey = `milestone:count:${countMilestone}`;
      if (!(await queries.isDuplicate(pool, dedupKey))) {
        const content = formatIronwoodMilestone({
          type: 'count',
          value: countMilestone,
          context: `${(volumeZec).toLocaleString(undefined, { maximumFractionDigits: 0 })} ZEC migrated`,
        });
        const outboxId = await queries.insertOutboxEntry(pool, {
          postType: 'milestone',
          dedupKey,
          content,
          metadata: { count: ironwood.totalMigrations, volumeZec },
          status: xClient.dryRun ? 'dry_run' : 'pending',
        });
        if (outboxId) {
          try {
            const result = await xClient.post(content);
            await queries.markPosted(pool, outboxId, result.id);
            results.push({ type: 'milestone', milestone: `count:${countMilestone}`, postId: result.id });
          } catch (err) {
            await queries.markFailed(pool, outboxId, err.message);
          }
        }
      }
    }
  } catch (err) {
    logger.error(`[Alerts] Ironwood milestone check failed: ${err.message}`);
  }

  // ─── 3. Reorg alerts ─────────────────────────────────────────────────────
  try {
    const since = new Date(Date.now() - config.reorg.lookbackMinutes * 60000).toISOString();
    const reorgs = await queries.getRecentReorgs(pool, {
      since,
      minDepth: config.reorg.minDepth,
    });

    for (const reorg of reorgs) {
      const dedupKey = `reorg:${reorg.id}`;
      if (await queries.isDuplicate(pool, dedupKey)) continue;

      const content = formatReorgAlert({
        depth: reorg.depth,
        oldTipHeight: Number(reorg.old_tip_height),
        newTipHeight: Number(reorg.new_tip_height),
      });

      const outboxId = await queries.insertOutboxEntry(pool, {
        postType: 'reorg',
        dedupKey,
        content,
        metadata: reorg,
        status: xClient.dryRun ? 'dry_run' : 'pending',
      });

      if (outboxId) {
        try {
          const result = await xClient.post(content);
          await queries.markPosted(pool, outboxId, result.id);
          results.push({ type: 'reorg', depth: reorg.depth, postId: result.id });
        } catch (err) {
          await queries.markFailed(pool, outboxId, err.message);
        }
      }
    }
  } catch (err) {
    logger.error(`[Alerts] Reorg check failed: ${err.message}`);
  }

  return results;
}

module.exports = { run };
