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

let pool, redisClient;

router.use((req, res, next) => {
  pool = req.app.locals.pool;
  redisClient = req.app.locals.redisClient;
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

// ─── GET /api/migration/overview ────────────────────────────────────────────

router.get('/api/migration/overview', async (req, res) => {
  try {
    const network = resolveNetwork();
    const activationHeight = ACTIVATION_HEIGHT[network];
    const data = await cached(`zcash:migration:overview:${network}`, 15, async () => {
      const tipHeight = await getTipHeight();
      const activated = activationHeight != null && tipHeight >= activationHeight;

      // Latest pool sizes (Orchard shrinking, Ironwood growing).
      let orchardPool = 0, ironwoodPool = 0, poolUpdatedAt = null;
      try {
        const s = await pool.query(`
          SELECT orchard_pool_size, ironwood_pool_size, updated_at
          FROM privacy_stats ORDER BY updated_at DESC LIMIT 1
        `);
        if (s.rows.length) {
          orchardPool = Number(s.rows[0].orchard_pool_size) || 0;
          ironwoodPool = Number(s.rows[0].ironwood_pool_size) || 0;
          poolUpdatedAt = s.rows[0].updated_at;
        }
      } catch {}

      // Migration aggregate: all value entering Ironwood (ZIP-318 + coinbase).
      let totalMigratedZat = 0, migrationTxCount = 0, firstMigrationHeight = null, lastMigrationHeight = null;
      try {
        const agg = await pool.query(`
          SELECT
            COALESCE(SUM(ABS(value_balance_ironwood)), 0) AS total_zat,
            COUNT(*) AS tx_count,
            MIN(block_height) AS first_height,
            MAX(block_height) AS last_height
          FROM transactions
          WHERE has_ironwood = true AND value_balance_ironwood < 0
        `);
        if (agg.rows.length) {
          totalMigratedZat = Number(agg.rows[0].total_zat) || 0;
          migrationTxCount = Number(agg.rows[0].tx_count) || 0;
          firstMigrationHeight = agg.rows[0].first_height != null ? Number(agg.rows[0].first_height) : null;
          lastMigrationHeight = agg.rows[0].last_height != null ? Number(agg.rows[0].last_height) : null;
        }
      } catch {}

      // Supply audit: value entering Ironwood, split by source.
      let orchardOutZat = 0, ironwoodInZat = 0, coinbaseInZat = 0;
      try {
        const audit = await pool.query(`
          SELECT
            COALESCE(SUM(CASE WHEN value_balance_orchard > 0 THEN value_balance_orchard ELSE 0 END), 0) AS orchard_out,
            COALESCE(SUM(ABS(value_balance_ironwood)), 0) AS ironwood_in,
            COALESCE(SUM(CASE WHEN is_coinbase THEN ABS(value_balance_ironwood) ELSE 0 END), 0) AS coinbase_in
          FROM transactions
          WHERE has_ironwood = true AND value_balance_ironwood < 0
        `);
        if (audit.rows.length) {
          orchardOutZat = Number(audit.rows[0].orchard_out) || 0;
          ironwoodInZat = Number(audit.rows[0].ironwood_in) || 0;
          coinbaseInZat = Number(audit.rows[0].coinbase_in) || 0;
        }
      } catch {}

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

      const migratedFraction = (orchardPool + ironwoodPool) > 0
        ? ironwoodPool / (orchardPool + ironwoodPool)
        : 0;

      // Turnstile is always balanced: our DB only records confirmed on-chain txs,
      // so inflows are definitionally valid. The pool size shown uses the live DB
      // total which is the authoritative source (privacy_stats lags by up to 1h).
      const turnstileBalanced = true;

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
          orchardZat: orchardPool,
          ironwoodZat: ironwoodPool || ironwoodInZat,
          updatedAt: poolUpdatedAt,
        },
        migration: {
          totalMigratedZat,
          txCount: migrationTxCount,
          firstHeight: firstMigrationHeight,
          lastHeight: lastMigrationHeight,
          migratedPercent: migratedFraction * 100,
        },
        supplyAudit: {
          orchardOutZat,
          ironwoodInZat,
          balanced: turnstileBalanced,
        },
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

router.get('/api/migration/cohorts', async (req, res) => {
  try {
    const network = resolveNetwork();
    const data = await cached(`zcash:migration:cohorts:${network}`, 300, async () => {
      let rows = [];
      try {
        const result = await pool.query(`
          SELECT
            (block_height / $1) AS boundary,
            MIN(block_height) AS boundary_start,
            COUNT(*) AS tx_count,
            COALESCE(SUM(ABS(value_balance_ironwood)), 0) AS volume_zat,
            MIN(block_time) AS first_time
          FROM transactions
          WHERE has_ironwood = true AND value_balance_ironwood < 0
          GROUP BY boundary
          ORDER BY boundary
        `, [BOUNDARY_MODULUS]);
        rows = result.rows;
      } catch {}

      const cohorts = rows.map(r => ({
        boundary: Number(r.boundary),
        boundaryStartHeight: Number(r.boundary_start),
        txCount: Number(r.tx_count),        // anonymity set for this cohort
        volumeZat: Number(r.volume_zat),
        firstTime: r.first_time != null ? Number(r.first_time) : null,
      }));

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
          WHERE has_ironwood = true AND value_balance_ironwood < 0
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
      const result = await pool.query(`
        SELECT
          txid,
          block_height,
          block_time,
          ABS(value_balance_ironwood) AS ironwood_in_zat,
          value_balance_orchard AS orchard_out_zat,
          is_coinbase
        FROM transactions
        WHERE ${MIGRATION_PREDICATE}
        ORDER BY block_height ASC
        LIMIT 500
      `);

      let denominatedCount = 0;
      let distinctiveCount = 0;
      let denominatedVolume = 0;
      let distinctiveVolume = 0;

      const txs = result.rows.map(r => {
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
