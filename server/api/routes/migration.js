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

// NU6.3 / Ironwood testnet activation height (confirmed in librustzcash
// release/nu6.3_testnet_support). Mainnet height is not yet chosen.
const ACTIVATION_HEIGHT = {
  testnet: 4134000,
  mainnet: null,
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
  return net === 'testnet' ? 'testnet' : 'mainnet';
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

      // Supply audit: all value entering Ironwood from any source.
      let orchardOutZat = 0, ironwoodInZat = 0;
      try {
        const audit = await pool.query(`
          SELECT
            COALESCE(SUM(CASE WHEN value_balance_orchard > 0 THEN value_balance_orchard ELSE 0 END), 0) AS orchard_out,
            COALESCE(SUM(ABS(value_balance_ironwood)), 0) AS ironwood_in
          FROM transactions
          WHERE has_ironwood = true AND value_balance_ironwood < 0
        `);
        if (audit.rows.length) {
          orchardOutZat = Number(audit.rows[0].orchard_out) || 0;
          ironwoodInZat = Number(audit.rows[0].ironwood_in) || 0;
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

      // Turnstile balanced: Ironwood inflow should match pool value from all sources
      // (coinbase + migrations). Compare against the pool size from valuePools.
      const turnstileBalanced = ironwoodInZat <= ironwoodPool || ironwoodInZat === 0;

      return {
        network,
        activationHeight,
        tipHeight,
        activated,
        avgBlockTimeSecs,
        blocksUntilActivation: activated || activationHeight == null
          ? 0
          : Math.max(0, activationHeight - tipHeight),
        poolSizes: {
          orchardZat: orchardPool,
          ironwoodZat: ironwoodPool,
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
  // Trim floating point noise for sub-1 ZEC denominations.
  return `${Number(v.toPrecision(2))} ZEC`;
}

module.exports = router;
