'use strict';

/**
 * CipherScan Data Bot — Real-time Alerts Job
 *
 * Checks for exceptional events and posts alerts with branded image cards.
 * Runs every ~5 minutes via the orchestrator.
 *
 * Alert types:
 *  - Large shield/deshield (adaptive percentile + absolute floor)
 *  - Ironwood milestones (pool size, Orchard->Ironwood %)
 *  - Cross-chain whale swaps (>$5K)
 *  - Privacy risk aggregate (daily HIGH-confidence linkages)
 *  - Chain reorgs (depth >= 2)
 */

const fs = require('fs');
const queries = require('../lib/queries');
const { DEFAULT_CONFIG, isExceptionalFlow, checkMilestone, computePercentileRank } = require('../lib/thresholds');
const { formatLargeFlowAlert, formatIronwoodMilestone, formatReorgAlert, formatCrossChainAlert, formatPrivacyRiskAlert, formatMigrationAlert } = require('../lib/formatter');
const { renderLargeFlow, renderCrossChain, renderMilestone, renderMigration, renderPrivacyRisk } = require('../lib/card-renderer');

function cleanup(filePath) {
  if (filePath) try { fs.unlinkSync(filePath); } catch { /* ignore */ }
}

async function postWithCard(xClient, content, renderFn, renderArgs, logger) {
  let imagePath = null;
  try {
    imagePath = await renderFn(renderArgs);
  } catch (err) {
    logger.warn(`[Alerts] Card render failed, posting text-only: ${err.message}`);
  }

  try {
    const result = imagePath
      ? await xClient.postWithMedia(content, imagePath)
      : await xClient.post(content);
    return result;
  } finally {
    cleanup(imagePath);
  }
}

async function run(pool, xClient, { logger = console, config = DEFAULT_CONFIG } = {}) {
  const results = [];

  // ─── 1. Large flow alerts ────────────────────────────────────────────────
  try {
    const rollingThreshold = await queries.getFlowPercentile(pool, {
      percentile: config.largeFlow.percentile,
      windowDays: config.largeFlow.windowDays,
    });

    const since = Math.floor(Date.now() / 1000) - 900;
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
          const result = await postWithCard(xClient, content, renderLargeFlow, {
            direction: flow.direction,
            amountZat: flow.amountZat,
            pool: flow.pool,
            blockHeight: flow.blockHeight,
            txid: flow.txid,
            percentileRank,
          }, logger);
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

  // ─── 1b. Pool migration alerts (>= 10K ZEC) ─────────────────────────────
  try {
    const since = Math.floor(Date.now() / 1000) - 900;
    const migrations = await queries.getLargeMigrations(pool, {
      minZat: 10_000_00000000, // >= 10,000 ZEC
      since,
    });

    for (const mig of migrations) {
      const dedupKey = `migration:${mig.txid}`;
      if (await queries.isDuplicate(pool, dedupKey)) continue;

      let priceUsd = null;
      try {
        const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=zcash&vs_currencies=usd');
        const data = await res.json();
        priceUsd = data?.zcash?.usd ? Number(data.zcash.usd) : null;
      } catch {
        // Fallback to daily table
        try {
          const { rows } = await pool.query(`SELECT price_usd FROM zec_price_daily ORDER BY date DESC LIMIT 1`);
          priceUsd = rows[0]?.price_usd ? Number(rows[0].price_usd) : null;
        } catch { /* non-critical */ }
      }

      let orchardLeftZat = null;
      let ironwoodBalZat = null;
      let migrated24hZat = null;
      let orchardToIronwoodPct = null;
      try {
        const ironwood = await queries.getIronwoodStats(pool);
        orchardLeftZat = ironwood.orchardBalanceZat || null;
        ironwoodBalZat = ironwood.poolSizeZat || null;
        orchardToIronwoodPct = ironwood.orchardToIronwoodPct || null;

        const { rows: mig24h } = await pool.query(`
          SELECT COALESCE(SUM(ABS(value_balance_ironwood)), 0) as total
          FROM transactions
          WHERE block_time >= $1
            AND vin_count = 0 AND vout_count = 0
            AND value_balance_orchard > 0 AND value_balance_ironwood < 0
        `, [Math.floor(Date.now() / 1000) - 86400]);
        migrated24hZat = Number(mig24h[0]?.total || 0);
      } catch { /* non-critical */ }

      const content = formatMigrationAlert({
        amountZat: mig.amountZat,
        fromPool: mig.fromPool,
        toPool: mig.toPool,
        txid: mig.txid,
        priceUsd,
      });

      const outboxId = await queries.insertOutboxEntry(pool, {
        postType: 'migration_alert',
        dedupKey,
        content,
        metadata: { ...mig, priceUsd },
        status: xClient.dryRun ? 'dry_run' : 'pending',
      });

      if (outboxId) {
        try {
          const result = await postWithCard(xClient, content, renderMigration, {
            amountZat: mig.amountZat,
            fromPool: mig.fromPool,
            toPool: mig.toPool,
            txid: mig.txid,
            orchardLeftZat,
            ironwoodBalZat,
            migrated24hZat,
            orchardToIronwoodPct,
            priceUsd,
          }, logger);
          await queries.markPosted(pool, outboxId, result.id);
          results.push({ type: 'migration', txid: mig.txid, postId: result.id });
        } catch (err) {
          await queries.markFailed(pool, outboxId, err.message);
        }
      }
    }
  } catch (err) {
    logger.error(`[Alerts] Migration check failed: ${err.message}`);
  }

  // ─── 2. Ironwood milestones ──────────────────────────────────────────────
  try {
    const ironwood = await queries.getIronwoodStats(pool);
    const milestoneConfig = config.ironwoodMilestones;

    const poolZec = ironwood.poolSizeZat / 1e8;
    const volumeMilestone = checkMilestone(poolZec, milestoneConfig.volumeSteps);
    if (volumeMilestone) {
      const dedupKey = `milestone:pool_size:${volumeMilestone}`;
      if (!(await queries.isDuplicate(pool, dedupKey))) {
        const content = formatIronwoodMilestone({
          type: 'volume',
          value: volumeMilestone,
          context: `${ironwood.orchardToIronwoodPct.toFixed(1)}% of Orchard migrated.`,
        });
        const outboxId = await queries.insertOutboxEntry(pool, {
          postType: 'milestone',
          dedupKey,
          content,
          metadata: { poolZec, orchardPct: ironwood.orchardToIronwoodPct },
          status: xClient.dryRun ? 'dry_run' : 'pending',
        });
        if (outboxId) {
          try {
            const result = await postWithCard(xClient, content, renderMilestone, {
              type: 'volume',
              value: poolZec,
              poolSizeZat: ironwood.poolSizeZat,
              orchardPct: ironwood.orchardToIronwoodPct,
            }, logger);
            await queries.markPosted(pool, outboxId, result.id);
            results.push({ type: 'milestone', milestone: `pool_size:${volumeMilestone}`, postId: result.id });
          } catch (err) {
            await queries.markFailed(pool, outboxId, err.message);
          }
        }
      }
    }

    const supplyPctMilestone = checkMilestone(ironwood.orchardToIronwoodPct, milestoneConfig.supplyPctSteps);
    if (supplyPctMilestone) {
      const dedupKey = `milestone:orchard_pct:${supplyPctMilestone}`;
      if (!(await queries.isDuplicate(pool, dedupKey))) {
        const content = formatIronwoodMilestone({
          type: 'supply_pct',
          value: supplyPctMilestone,
          context: `Pool size: ${(poolZec / 1000).toFixed(0)}K ZEC.`,
        });
        const outboxId = await queries.insertOutboxEntry(pool, {
          postType: 'milestone',
          dedupKey,
          content,
          metadata: { orchardPct: ironwood.orchardToIronwoodPct, poolZec },
          status: xClient.dryRun ? 'dry_run' : 'pending',
        });
        if (outboxId) {
          try {
            const result = await postWithCard(xClient, content, renderMilestone, {
              type: 'supply_pct',
              value: supplyPctMilestone,
              poolSizeZat: ironwood.poolSizeZat,
              orchardPct: ironwood.orchardToIronwoodPct,
            }, logger);
            await queries.markPosted(pool, outboxId, result.id);
            results.push({ type: 'milestone', milestone: `orchard_pct:${supplyPctMilestone}`, postId: result.id });
          } catch (err) {
            await queries.markFailed(pool, outboxId, err.message);
          }
        }
      }
    }
  } catch (err) {
    logger.error(`[Alerts] Ironwood milestone check failed: ${err.message}`);
  }

  // ─── 3. Cross-chain whale alerts ────────────────────────────────────────
  try {
    const since = new Date(Date.now() - 5 * 60000).toISOString();
    const largeSwaps = await queries.getRecentLargeSwaps(pool, {
      minUsd: config.crossChain.minUsd,
      since,
    });

    for (const swap of largeSwaps) {
      const dedupKey = `cross_chain:${swap.id}`;
      if (await queries.isDuplicate(pool, dedupKey)) continue;

      const content = formatCrossChainAlert({
        direction: swap.direction,
        amountUsd: swap.amountUsd,
        sourceChain: swap.sourceChain,
        destChain: swap.destChain,
        zecTxid: swap.zecTxid,
      });

      const outboxId = await queries.insertOutboxEntry(pool, {
        postType: 'cross_chain_alert',
        dedupKey,
        content,
        metadata: swap,
        status: xClient.dryRun ? 'dry_run' : 'pending',
      });

      if (outboxId) {
        try {
          const result = await postWithCard(xClient, content, renderCrossChain, {
            direction: swap.direction,
            amountUsd: swap.amountUsd,
            sourceChain: swap.sourceChain,
            destChain: swap.destChain,
            zecTxid: swap.zecTxid,
          }, logger);
          await queries.markPosted(pool, outboxId, result.id);
          results.push({ type: 'cross_chain', id: swap.id, postId: result.id });
        } catch (err) {
          await queries.markFailed(pool, outboxId, err.message);
        }
      }
    }
  } catch (err) {
    logger.error(`[Alerts] Cross-chain check failed: ${err.message}`);
  }

  // ─── 4. Privacy risk aggregate (once daily) ────────────────────────────
  try {
    const today = new Date().toISOString().slice(0, 10);
    const dedupKey = `privacy_risk:${today}`;

    if (!(await queries.isDuplicate(pool, dedupKey))) {
      const since24h = new Date(Date.now() - 24 * 3600000).toISOString();
      const [highLinkages, batchClusters] = await Promise.all([
        queries.getRecentHighRiskLinkages(pool, { since: since24h }),
        queries.getRecentBatchClusters(pool, { since: since24h }),
      ]);

      const hasRisk = highLinkages.highCount >= config.privacyRisk.minHighLinkages || batchClusters.clusterCount > 0;

      if (hasRisk) {
        const content = formatPrivacyRiskAlert({ highLinkages, batchClusters });

        const outboxId = await queries.insertOutboxEntry(pool, {
          postType: 'privacy_risk',
          dedupKey,
          content,
          metadata: { highLinkages, batchClusters, date: today },
          status: xClient.dryRun ? 'dry_run' : 'pending',
        });

        if (outboxId) {
          try {
            const result = await postWithCard(xClient, content, renderPrivacyRisk, {
              highLinkages,
              batchClusters,
            }, logger);
            await queries.markPosted(pool, outboxId, result.id);
            results.push({ type: 'privacy_risk', postId: result.id });
          } catch (err) {
            await queries.markFailed(pool, outboxId, err.message);
          }
        }
      }
    }
  } catch (err) {
    logger.error(`[Alerts] Privacy risk check failed: ${err.message}`);
  }

  // ─── 5. Reorg alerts (text-only, no card needed) ───────────────────────
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
        forkHeight: Number(reorg.fork_height),
        canonicalTip: Number(reorg.canonical_tip),
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
