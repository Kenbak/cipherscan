/**
 * Orchard → Ironwood Migration Routes (NU6.3)
 *
 * GET /api/migration/overview       — activation status, pool sizes, % migrated, supply audit
 * GET /api/migration/cohorts        — migration volume + anonymity set per boundary bucket
 * GET /api/migration/denominations  — power-of-ten denomination histogram of Ironwood outputs
 *
 * A ZIP-318 migration is a v6 transaction with no transparent I/O whose Orchard value
 * balance is positive (value leaving Orchard) and Ironwood value balance is negative
 * (value entering Ironwood). Because a compliant migration creates exactly one Ironwood
 * output and spends no Ironwood notes, the magnitude of `value_balance_ironwood` equals
 * the (otherwise shielded) output denomination — which is what makes the denomination
 * histogram observable from the explorer's vantage point.
 *
 * Values are stored in zatoshis (BIGINT). 1 ZEC = 100,000,000 zatoshis.
 */

const express = require('express');
const router = express.Router();

// NU6.3 / Ironwood activation heights.
// Mainnet: height 3,428,143 (~July 28 2026 8AM EST). Announced by Sean Bowe.
const ACTIVATION_HEIGHT = {
  testnet: 4134000,
  mainnet: 3428143,
};

// Anchor boundary spacing (ZIP 318 provisional): height ≡ 0 mod M, M = 256
// (~5.3h at 75s blocks). Migrations sharing a boundary form an anonymity cohort.
const BOUNDARY_MODULUS = 256;

let pool, redisClient, callZebraRPC;

router.use((req, res, next) => {
  pool = req.app.locals.pool;
  redisClient = req.app.locals.redisClient;
  callZebraRPC = req.app.locals.callZebraRPC;
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

function resolveNetwork() {
  const net = (process.env.ZCASH_NETWORK || process.env.NETWORK || 'mainnet').toLowerCase();
  if (net === 'testnet') return 'testnet';
  if (net === 'crosslink' || net === 'crosslink-testnet') return 'crosslink-testnet';
  return 'mainnet';
}

// Crosslink is a separate experimental chain and does not inherit Zcash
// mainnet's Ironwood schedule. Keep these endpoints unavailable until that
// deployment has an explicit, verified activation policy.
router.use('/api/migration', (req, res, next) => {
  if (resolveNetwork() === 'crosslink-testnet') {
    return res.status(404).json({
      success: false,
      error: 'Ironwood migration data is not available on Crosslink.',
    });
  }
  next();
});

// Reference node for testnet: zec.rocks lightwalletd gRPC
const REFERENCE_GRPC_URL = 'testnet.zec.rocks:443';
let referenceHeight = null;
let referenceLastFetched = 0;

async function fetchReferenceHeight() {
  if (resolveNetwork() !== 'testnet') return null;
  if (Date.now() - referenceLastFetched < 30000) return referenceHeight;
  try {
    const { execSync } = require('child_process');
    const out = execSync(
      `grpcurl -max-time 3 ${REFERENCE_GRPC_URL} cash.z.wallet.sdk.rpc.CompactTxStreamer/GetLatestBlock 2>/dev/null`,
      { timeout: 5000, encoding: 'utf8' }
    );
    const parsed = JSON.parse(out);
    referenceHeight = parseInt(parsed.height) || null;
    referenceLastFetched = Date.now();
  } catch {
    // Non-critical — don't block the response
  }
  return referenceHeight;
}

// Shared WHERE clause identifying a compliant Orchard → Ironwood migration tx.
const MIGRATION_PREDICATE = `
  version = 6
  AND has_ironwood = true
  AND value_balance_orchard > 0
  AND value_balance_ironwood < 0
  AND vin_count = 0
  AND vout_count = 0
`;

async function getTipHeight() {
  const r = await pool.query('SELECT MAX(height) AS h FROM blocks');
  return r.rows.length ? Number(r.rows[0].h) || 0 : 0;
}

function parsePoolZat(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function extractZebraPoolSnapshot(blockchainInfo) {
  if (!blockchainInfo || !Array.isArray(blockchainInfo.valuePools)) return null;

  const height = Number(blockchainInfo.blocks);
  const pools = new Map(blockchainInfo.valuePools.map((entry) => [entry.id, entry]));
  const orchardZat = parsePoolZat(pools.get('orchard')?.chainValueZat);
  const ironwoodZat = parsePoolZat(pools.get('ironwood')?.chainValueZat);

  if (!Number.isSafeInteger(height) || height < 0 || orchardZat === null || ironwoodZat === null) {
    return null;
  }

  const sproutZat = parsePoolZat(pools.get('sprout')?.chainValueZat) ?? 0;
  const saplingZat = parsePoolZat(pools.get('sapling')?.chainValueZat) ?? 0;
  const deferredZat = parsePoolZat(pools.get('deferred')?.chainValueZat) ?? 0;

  const shieldedTotalZat = sproutZat + saplingZat + orchardZat + ironwoodZat;

  // chainSupply from Zebra gives total minted supply; transparent = total - shielded - lockbox
  const chainSupplyZat = blockchainInfo.chainSupply?.chainValueZat != null
    ? parsePoolZat(blockchainInfo.chainSupply.chainValueZat)
    : null;
  const transparentZat = chainSupplyZat != null
    ? chainSupplyZat - shieldedTotalZat - deferredZat
    : null;

  return {
    orchardZat,
    ironwoodZat,
    sproutZat,
    saplingZat,
    deferredZat,
    transparentZat,
    shieldedTotalZat,
    chainSupplyZat,
    height,
    updatedAt: new Date().toISOString(),
    source: 'zebra',
    isLive: true,
  };
}

function buildSupplyAudit({
  ironwoodInZat,
  ironwoodOutZat,
  authoritativePoolZat,
  accountingHeight,
  sourceHeight,
  source,
}) {
  const indexedNetZat = ironwoodInZat - ironwoodOutZat;
  const differenceZat = authoritativePoolZat - indexedNetZat;

  let status = 'balanced';
  if (source !== 'zebra') status = 'stale';
  else if (differenceZat !== 0 && accountingHeight < sourceHeight) status = 'syncing';
  else if (differenceZat !== 0) status = 'mismatch';

  return {
    ironwoodInZat,
    ironwoodOutZat,
    indexedNetZat,
    authoritativePoolZat,
    differenceZat,
    accountingHeight,
    sourceHeight,
    status,
    balanced: status === 'balanced' ? true : status === 'mismatch' ? false : null,
  };
}

// ─── GET /api/migration/overview ────────────────────────────────────────────

router.get('/api/migration/overview', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const network = resolveNetwork();
    const activationHeight = ACTIVATION_HEIGHT[network];
    const data = await cached(`zcash:migration:overview:v2:${network}`, 5, async () => {
      const dbTipHeight = await getTipHeight();

      // Zebra's valuePools are authoritative for the current net pool balances.
      // Keep the hourly privacy_stats snapshot only as a disclosed availability
      // fallback; cumulative transaction inflow is never a pool-balance fallback.
      let poolSnapshot = null;
      if (typeof callZebraRPC === 'function') {
        try {
          const blockchainInfo = await callZebraRPC('getblockchaininfo', [], { timeout: 2500 });
          poolSnapshot = extractZebraPoolSnapshot(blockchainInfo);
          if (!poolSnapshot) {
            console.warn('[MIGRATION] Zebra returned invalid valuePools');
          }
        } catch (error) {
          console.warn('[MIGRATION] Live Zebra pool lookup failed:', error.message);
        }
      }

      if (!poolSnapshot) {
        try {
          const snapshotResult = await pool.query(`
            SELECT orchard_pool_size, ironwood_pool_size, last_block_scanned, updated_at
            FROM privacy_stats ORDER BY updated_at DESC LIMIT 1
          `);
          const snapshot = snapshotResult.rows[0];
          const orchardZat = parsePoolZat(snapshot?.orchard_pool_size);
          const ironwoodZat = parsePoolZat(snapshot?.ironwood_pool_size);
          const height = Number(snapshot?.last_block_scanned);
          if (orchardZat !== null && ironwoodZat !== null && Number.isSafeInteger(height)) {
            poolSnapshot = {
              orchardZat,
              ironwoodZat,
              sproutZat: 0,
              saplingZat: 0,
              deferredZat: 0,
              transparentZat: null,
              shieldedTotalZat: 0,
              chainSupplyZat: null,
              height,
              updatedAt: snapshot.updated_at,
              source: 'privacy_stats',
              isLive: false,
            };
          }
        } catch (error) {
          console.error('[MIGRATION] Stored pool snapshot lookup failed:', error.message);
        }
      }

      if (!poolSnapshot) {
        throw new Error('No authoritative or stored Ironwood pool snapshot is available');
      }

      const tipHeight = poolSnapshot.isLive ? poolSnapshot.height : dbTipHeight;
      const activated = activationHeight != null && tipHeight >= activationHeight;

      // One scan yields the gross ledger and migration metadata. Negative
      // Ironwood value balance enters the pool; positive balance leaves it.
      // Source breakdown: classify each inflow by where the value came from.
      const ledgerResult = await pool.query(`
        SELECT
          COALESCE(SUM(-value_balance_ironwood)
            FILTER (WHERE value_balance_ironwood < 0), 0) AS ironwood_in,
          COALESCE(SUM(value_balance_ironwood)
            FILTER (WHERE value_balance_ironwood > 0), 0) AS ironwood_out,
          COALESCE(SUM(value_balance_orchard)
            FILTER (WHERE value_balance_ironwood < 0 AND value_balance_orchard > 0), 0) AS orchard_out,
          COALESCE(SUM(-value_balance_ironwood)
            FILTER (WHERE value_balance_ironwood < 0 AND is_coinbase), 0) AS coinbase_in,
          COALESCE(SUM(-value_balance_ironwood)
            FILTER (WHERE value_balance_ironwood < 0 AND value_balance_sapling > 0
                    AND NOT is_coinbase AND value_balance_orchard <= 0), 0) AS sapling_in,
          COALESCE(SUM(-value_balance_ironwood)
            FILTER (WHERE value_balance_ironwood < 0 AND vin_count > 0
                    AND NOT is_coinbase AND value_balance_orchard <= 0
                    AND value_balance_sapling <= 0), 0) AS transparent_in,
          COUNT(*) FILTER (WHERE value_balance_ironwood < 0) AS inflow_tx_count,
          COUNT(*) FILTER (WHERE value_balance_ironwood < 0 AND value_balance_orchard > 0
                           AND NOT is_coinbase) AS orchard_tx_count,
          COUNT(*) FILTER (WHERE value_balance_ironwood < 0 AND is_coinbase) AS coinbase_tx_count,
          COUNT(*) FILTER (WHERE value_balance_ironwood < 0 AND value_balance_sapling > 0
                           AND NOT is_coinbase AND value_balance_orchard <= 0) AS sapling_tx_count,
          COUNT(*) FILTER (WHERE value_balance_ironwood < 0 AND vin_count > 0
                           AND NOT is_coinbase AND value_balance_orchard <= 0
                           AND value_balance_sapling <= 0) AS transparent_tx_count,
          MIN(block_height) FILTER (WHERE value_balance_ironwood < 0) AS first_inflow_height,
          MAX(block_height) FILTER (WHERE value_balance_ironwood < 0) AS last_inflow_height
        FROM transactions
        WHERE has_ironwood = true
      `);
      const ledger = ledgerResult.rows[0];
      const ironwoodInZat = Number(ledger.ironwood_in) || 0;
      const ironwoodOutZat = Number(ledger.ironwood_out) || 0;
      const orchardOutZat = Number(ledger.orchard_out) || 0;
      const coinbaseInZat = Number(ledger.coinbase_in) || 0;
      const saplingInZat = Number(ledger.sapling_in) || 0;
      const transparentInZat = Number(ledger.transparent_in) || 0;
      const orchardInZat = ironwoodInZat - coinbaseInZat - saplingInZat - transparentInZat;
      const migrationTxCount = Number(ledger.inflow_tx_count) || 0;
      const firstMigrationHeight = ledger.first_inflow_height != null
        ? Number(ledger.first_inflow_height)
        : null;
      const lastMigrationHeight = ledger.last_inflow_height != null
        ? Number(ledger.last_inflow_height)
        : null;
      const totalMigratedZat = ironwoodInZat;

      // Average block time from recent blocks (last 100)
      let avgBlockTimeSecs = 75;
      try {
        const bt = await pool.query(`
          SELECT (MAX(timestamp) - MIN(timestamp))::float / NULLIF(COUNT(*) - 1, 0) AS avg_secs
          FROM (SELECT timestamp FROM blocks ORDER BY height DESC LIMIT 100) sub
        `);
        if (bt.rows.length && bt.rows[0].avg_secs) {
          avgBlockTimeSecs = Math.round(Number(bt.rows[0].avg_secs) * 10) / 10;
        }
      } catch {}

      const migratedFraction = (poolSnapshot.orchardZat + poolSnapshot.ironwoodZat) > 0
        ? poolSnapshot.ironwoodZat / (poolSnapshot.orchardZat + poolSnapshot.ironwoodZat)
        : 0;

      let velocityZatPerHour = 0;
      if (firstMigrationHeight && lastMigrationHeight && lastMigrationHeight > firstMigrationHeight) {
        const blocksElapsed = lastMigrationHeight - firstMigrationHeight;
        const hoursElapsed = (blocksElapsed * avgBlockTimeSecs) / 3600;
        if (hoursElapsed > 0) velocityZatPerHour = Math.round(totalMigratedZat / hoursElapsed);
      }

      const supplyAudit = buildSupplyAudit({
        ironwoodInZat,
        ironwoodOutZat,
        authoritativePoolZat: poolSnapshot.ironwoodZat,
        accountingHeight: dbTipHeight,
        sourceHeight: poolSnapshot.height,
        source: poolSnapshot.source,
      });

      const refHeight = await fetchReferenceHeight();

      return {
        network,
        activationHeight,
        tipHeight,
        activated,
        avgBlockTimeSecs,
        referenceNode: refHeight ? { name: 'zec.rocks', height: refHeight } : null,
        blocksUntilActivation: activated || activationHeight == null
          ? 0
          : Math.max(0, activationHeight - tipHeight),
        poolSizes: {
          orchardZat: poolSnapshot.orchardZat,
          ironwoodZat: poolSnapshot.ironwoodZat,
          sproutZat: poolSnapshot.sproutZat,
          saplingZat: poolSnapshot.saplingZat,
          deferredZat: poolSnapshot.deferredZat,
          transparentZat: poolSnapshot.transparentZat,
          shieldedTotalZat: poolSnapshot.shieldedTotalZat,
          chainSupplyZat: poolSnapshot.chainSupplyZat,
          updatedAt: poolSnapshot.updatedAt,
          source: poolSnapshot.source,
          sourceHeight: poolSnapshot.height,
          isLive: poolSnapshot.isLive,
        },
        migration: {
          totalMigratedZat,
          txCount: migrationTxCount,
          firstHeight: firstMigrationHeight,
          lastHeight: lastMigrationHeight,
          migratedPercent: migratedFraction * 100,
          velocityZatPerHour,
        },
        inflowSources: {
          fromOrchardZat: orchardInZat,
          fromOrchardTxs: Number(ledger.orchard_tx_count) || 0,
          fromSaplingZat: saplingInZat,
          fromSaplingTxs: Number(ledger.sapling_tx_count) || 0,
          fromTransparentZat: transparentInZat,
          fromTransparentTxs: Number(ledger.transparent_tx_count) || 0,
          fromCoinbaseZat: coinbaseInZat,
          fromCoinbaseTxs: Number(ledger.coinbase_tx_count) || 0,
          totalInZat: ironwoodInZat,
          totalOutZat: ironwoodOutZat,
        },
        supplyAudit: {
          orchardOutZat,
          coinbaseInZat,
          ...supplyAudit,
        },
        supplyVerification: poolSnapshot.chainSupplyZat != null ? {
          chainSupplyZat: poolSnapshot.chainSupplyZat,
          verifiedZat: poolSnapshot.chainSupplyZat - poolSnapshot.orchardZat,
          unverifiedZat: poolSnapshot.orchardZat,
          verifiedPct: poolSnapshot.chainSupplyZat > 0
            ? ((poolSnapshot.chainSupplyZat - poolSnapshot.orchardZat) / poolSnapshot.chainSupplyZat) * 100
            : 0,
        } : null,
      };
    });

    res.json({ success: true, ...data });
  } catch (err) {
    console.error('migration/overview error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/migration/cohorts ─────────────────────────────────────────────
// Migration volume and anonymity set per boundary bucket. Each bucket spans
// BOUNDARY_MODULUS blocks (~5.3h). Bucketing by block height is a proxy for the
// ZIP-318 anchor-boundary cohort until the Ironwood anchor is indexed directly.
//
// Each cohort also includes:
//   - ironwoodPoolZat: net Ironwood pool balance at this boundary (cumulative
//     from ALL Ironwood txs, not just migrations — accounts for outflows)
//   - orchardOutflowZat: cumulative Orchard outflow since activation

router.get('/api/migration/cohorts', async (req, res) => {
  try {
    const network = resolveNetwork();
    const data = await cached(`zcash:migration:cohorts:v2:${network}`, 300, async () => {
      // 1) Migration cohorts: volume and anonymity per boundary (strict Orchard->Ironwood)
      let migrationRows = [];
      try {
        const result = await pool.query(`
          SELECT
            (block_height / $1) AS boundary,
            MIN(block_height) AS boundary_start,
            COUNT(*) AS tx_count,
            COALESCE(SUM(ABS(value_balance_ironwood)), 0) AS volume_zat,
            MIN(block_time) AS first_time
          FROM transactions
          WHERE ${MIGRATION_PREDICATE}
          GROUP BY boundary
          ORDER BY boundary
        `, [BOUNDARY_MODULUS]);
        migrationRows = result.rows;
      } catch {}

      // 2) Net Ironwood pool balance per boundary from ALL Ironwood txs.
      //    value_balance_ironwood: negative = into pool, positive = out of pool.
      //    Cumulative SUM(-vbi) = net pool size at each boundary.
      const netBalanceMap = new Map();
      try {
        const netResult = await pool.query(`
          SELECT
            boundary,
            SUM(net_delta) OVER (ORDER BY boundary) AS cumulative_net_zat
          FROM (
            SELECT
              (block_height / $1) AS boundary,
              SUM(-value_balance_ironwood) AS net_delta
            FROM transactions
            WHERE has_ironwood = true
            GROUP BY boundary
          ) sub
          ORDER BY boundary
        `, [BOUNDARY_MODULUS]);
        for (const r of netResult.rows) {
          netBalanceMap.set(Number(r.boundary), Number(r.cumulative_net_zat));
        }
      } catch {}

      // 3) Cumulative net Orchard outflow since activation.
      //    value_balance_orchard: positive = leaving Orchard pool.
      const activationHeight = ACTIVATION_HEIGHT[network];
      const orchardDeltaMap = new Map();
      try {
        const orchardResult = await pool.query(`
          SELECT
            boundary,
            SUM(orchard_delta) OVER (ORDER BY boundary) AS cumulative_orchard_outflow_zat
          FROM (
            SELECT
              (block_height / $1) AS boundary,
              SUM(value_balance_orchard) AS orchard_delta
            FROM transactions
            WHERE block_height >= $2
              AND (has_orchard = true OR has_ironwood = true)
            GROUP BY boundary
          ) sub
          ORDER BY boundary
        `, [BOUNDARY_MODULUS, activationHeight || 0]);
        for (const r of orchardResult.rows) {
          orchardDeltaMap.set(Number(r.boundary), Number(r.cumulative_orchard_outflow_zat));
        }
      } catch {}

      const cohorts = migrationRows.map(r => {
        const boundary = Number(r.boundary);
        return {
          boundary,
          boundaryStartHeight: Number(r.boundary_start),
          txCount: Number(r.tx_count),
          volumeZat: Number(r.volume_zat),
          firstTime: r.first_time != null ? Number(r.first_time) : null,
          ironwoodPoolZat: netBalanceMap.get(boundary) ?? null,
          orchardOutflowZat: orchardDeltaMap.get(boundary) ?? null,
        };
      });

      const anonymitySets = cohorts.map(c => c.txCount);
      const avgAnonymitySet = anonymitySets.length
        ? anonymitySets.reduce((a, b) => a + b, 0) / anonymitySets.length
        : 0;

      return {
        network,
        boundaryModulus: BOUNDARY_MODULUS,
        cohortCount: cohorts.length,
        avgAnonymitySet,
        minAnonymitySet: anonymitySets.length ? Math.min(...anonymitySets) : 0,
        maxAnonymitySet: anonymitySets.length ? Math.max(...anonymitySets) : 0,
        cohorts,
      };
    });

    res.json({ success: true, ...data });
  } catch (err) {
    console.error('migration/cohorts error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/migration/denominations ───────────────────────────────────────
// Power-of-ten denomination histogram. For a single-output migration the note
// denomination equals ABS(value_balance_ironwood). We bin by floor(log10(ZEC)).

router.get('/api/migration/denominations', async (req, res) => {
  try {
    const network = resolveNetwork();
    const data = await cached(`zcash:migration:denominations:${network}`, 300, async () => {
      let rows = [];
      try {
        // Bin on the integer power of ten of the ZEC value. FLOOR(LOG10(zat/1e8))
        // maps 100 → 2, 10 → 1, 1 → 0, 0.1 → -1, 0.01 → -2, etc.
        const result = await pool.query(`
          SELECT
            FLOOR(LOG(10, GREATEST(ABS(value_balance_ironwood)::numeric / 100000000, 1e-8))) AS power,
            COUNT(*) AS tx_count,
            COALESCE(SUM(ABS(value_balance_ironwood)), 0) AS volume_zat
          FROM transactions
          WHERE ${MIGRATION_PREDICATE}
          GROUP BY power
          ORDER BY power DESC
        `);
        rows = result.rows;
      } catch {}

      const bins = rows.map(r => {
        const power = Number(r.power);
        return {
          power,
          denomination: Math.pow(10, power), // ZEC value of the bin (100, 10, 1, 0.1, …)
          label: labelForPower(power),
          txCount: Number(r.tx_count),
          volumeZat: Number(r.volume_zat),
        };
      });

      const totalTx = bins.reduce((a, b) => a + b.txCount, 0);

      return { network, totalTx, bins };
    });

    res.json({ success: true, ...data });
  } catch (err) {
    console.error('migration/denominations error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function labelForPower(power) {
  const v = Math.pow(10, power);
  if (v >= 1) return `${v} ZEC`;
  return `${Number(v.toPrecision(2))} ZEC`;
}

// ─── GET /api/migration/scatter ──────────────────────────────────────────────
// Individual migration transactions with privacy classification.
// Each tx is tagged as "denominated" (common power-of-ten amount within 0.1%
// tolerance) or "distinctive" (unique amount that weakens privacy).

const COMMON_DENOMINATIONS = [0.001, 0.01, 0.1, 1, 10, 100, 1000];
const DENOM_TOLERANCE = 0.001; // 0.1% tolerance for fee rounding

function classifyAmount(zec) {
  for (const d of COMMON_DENOMINATIONS) {
    if (Math.abs(zec - d) / d <= DENOM_TOLERANCE) return { denomination: d, privacy: 'denominated' };
  }
  return { denomination: null, privacy: 'distinctive' };
}

router.get('/api/migration/scatter', async (req, res) => {
  try {
    const network = resolveNetwork();
    const data = await cached(`zcash:migration:scatter:${network}`, 60, async () => {
      // Full classification across ALL migrations for accurate headline stats
      const allResult = await pool.query(`
        SELECT ABS(value_balance_ironwood) AS ironwood_in_zat
        FROM transactions
        WHERE ${MIGRATION_PREDICATE}
      `);

      let denominatedCount = 0;
      let distinctiveCount = 0;
      let denominatedVolume = 0;
      let distinctiveVolume = 0;

      allResult.rows.forEach(r => {
        const zat = Number(r.ironwood_in_zat);
        const zec = zat / 1e8;
        const classification = classifyAmount(zec);
        if (classification.privacy === 'denominated') {
          denominatedCount++;
          denominatedVolume += zat;
        } else {
          distinctiveCount++;
          distinctiveVolume += zat;
        }
      });

      // Most recent 500 for scatter plot visualization
      const plotResult = await pool.query(`
        SELECT
          txid,
          block_height,
          block_time,
          ABS(value_balance_ironwood) AS ironwood_in_zat,
          value_balance_orchard AS orchard_out_zat,
          is_coinbase
        FROM transactions
        WHERE ${MIGRATION_PREDICATE}
        ORDER BY block_height DESC
        LIMIT 500
      `);

      const txs = plotResult.rows.map(r => {
        const zat = Number(r.ironwood_in_zat);
        const zec = zat / 1e8;
        const classification = classifyAmount(zec);
        return {
          txid: r.txid,
          height: Number(r.block_height),
          timestamp: r.block_time ? Number(r.block_time) : null,
          amountZat: zat,
          amountZec: zec,
          orchardOutZat: Number(r.orchard_out_zat) || 0,
          isCoinbase: r.is_coinbase,
          privacy: classification.privacy,
          matchedDenomination: classification.denomination,
        };
      });

      const total = denominatedCount + distinctiveCount;
      return {
        network,
        total,
        denominatedCount,
        distinctiveCount,
        denominatedPercent: total > 0 ? Math.round((denominatedCount / total) * 100) : 0,
        denominatedVolumeZat: denominatedVolume,
        distinctiveVolumeZat: distinctiveVolume,
        txs,
      };
    });

    res.json({ success: true, ...data });
  } catch (err) {
    console.error('migration/scatter error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
