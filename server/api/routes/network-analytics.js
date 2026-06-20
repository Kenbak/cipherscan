/**
 * Network analytics routes — halving, mining history, pool trends, emission, chain size.
 * Requires chain_snapshots table for size history (see docs/network-analytics-setup.md).
 */

const MAX_SUPPLY_ZEC = 21_000_000;
const HALVING_CACHE_KEY = 'zcash:halving_info';
const HALVING_CACHE_TTL = 86400; // 24h

async function getFromRedisCache(redisClient, key) {
  try {
    if (!redisClient?.isOpen) return null;
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

async function setRedisCache(redisClient, key, data, ttlSeconds) {
  try {
    if (!redisClient?.isOpen) return false;
    await redisClient.setEx(key, ttlSeconds, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

function periodToInterval(period) {
  const map = { '7d': '7 days', '30d': '30 days', '90d': '90 days', '1y': '365 days', all: '10 years' };
  return map[period] || '90 days';
}

/** True when per-pool columns hold real chain-state history (not flat ratio estimates). */
async function hasVerifiedPerPoolBreakdown(pool) {
  const result = await pool.query(`
    SELECT orchard_pool_size, pool_size
    FROM privacy_trends_daily
    WHERE orchard_pool_size > 0 AND pool_size > 0
      AND date >= CURRENT_DATE - INTERVAL '365 days'
  `);
  if (result.rows.length < 7) return false;

  const ratios = result.rows.map((r) => {
    const orchard = Number(r.orchard_pool_size) || 0;
    const shielded = Number(r.pool_size) || 0;
    return shielded > 0 ? orchard / shielded : 0;
  });

  return Math.max(...ratios) - Math.min(...ratios) > 0.01;
}

/** Shielded supply % = shielded ZEC / total chain supply. Never use tx-adoption %. */
function computeShieldedSupplyPct({ shieldedZat, chainSupplyZat, sproutZat, saplingZat, orchardZat, transparentZat }) {
  if (chainSupplyZat > 0 && shieldedZat > 0) {
    return (shieldedZat / chainSupplyZat) * 100;
  }
  const poolTotalZat = sproutZat + saplingZat + orchardZat + transparentZat;
  if (poolTotalZat > 0 && shieldedZat > 0) {
    return (shieldedZat / poolTotalZat) * 100;
  }
  // pool_size is tracked but chain_supply not backfilled — omit (do not guess from shielded pool)
  return null;
}

function rollingAverage(values, window) {
  if (values.length === 0) return [];
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
    out.push(avg);
  }
  return out;
}

async function findEraStartBlock(callZebraRPC, currentHeight, currentTotal) {
  const step = 25000;
  for (let h = currentHeight; h > 0; h -= step) {
    const sub = await callZebraRPC('getblocksubsidy', [h]);
    if (sub?.totalblocksubsidy !== currentTotal) {
      return Math.min(currentHeight, h + 1);
    }
  }
  return 1;
}

async function discoverNextHalving(callZebraRPC, currentHeight) {
  const current = await callZebraRPC('getblocksubsidy');
  const currentTotal = current?.totalblocksubsidy;
  if (!currentTotal) throw new Error('Could not read current block subsidy');

  const coarseStep = 50000;
  const maxScan = 2_000_000;
  let coarseHit = null;

  for (let h = currentHeight + coarseStep; h <= currentHeight + maxScan; h += coarseStep) {
    const sub = await callZebraRPC('getblocksubsidy', [h]);
    if (sub?.totalblocksubsidy < currentTotal) {
      coarseHit = h;
      break;
    }
  }

  if (!coarseHit) {
    return {
      halvingBlock: null,
      blocksRemaining: null,
      currentSubsidy: currentTotal,
      nextSubsidy: null,
      minerReward: current.miner ?? currentTotal,
      nextMinerReward: null,
      fundingStreams: current.fundingstreamstotal ?? 0,
      lockbox: current.lockboxtotal ?? 0,
    };
  }

  let lo = Math.max(currentHeight + 1, coarseHit - coarseStep);
  let hi = coarseHit;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const sub = await callZebraRPC('getblocksubsidy', [mid]);
    if (sub?.totalblocksubsidy < currentTotal) hi = mid;
    else lo = mid + 1;
  }

  const nextSubsidy = await callZebraRPC('getblocksubsidy', [lo]);
  const eraStart = await findEraStartBlock(callZebraRPC, currentHeight, currentTotal);
  const eraLength = lo - eraStart;
  const progress = eraLength > 0 ? ((currentHeight - eraStart) / eraLength) * 100 : 0;

  return {
    halvingBlock: lo,
    blocksRemaining: lo - currentHeight,
    eraStartBlock: eraStart,
    eraProgress: Math.min(Math.max(progress, 0), 100),
    currentSubsidy: currentTotal,
    nextSubsidy: nextSubsidy?.totalblocksubsidy ?? null,
    minerReward: current.miner ?? currentTotal,
    nextMinerReward: nextSubsidy?.miner ?? null,
    fundingStreams: current.fundingstreamstotal ?? 0,
    lockbox: current.lockboxtotal ?? 0,
  };
}

async function tableExists(pool, tableName) {
  const r = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  return r.rows.length > 0;
}

async function columnExists(pool, tableName, columnName) {
  const r = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [tableName, columnName]
  );
  return r.rows.length > 0;
}

/** Chain supply never decreases — enforce before charting. */
function enforceMonotonicSupply(points) {
  if (points.length === 0) return points;
  const out = [{ ...points[0] }];
  for (let i = 1; i < points.length; i++) {
    const prev = out[i - 1].circulating;
    const curr = points[i].circulating;
    out.push({
      ...points[i],
      circulating: curr != null && curr >= prev ? curr : prev,
    });
  }
  return out;
}

/** Fill missing calendar days so charts don't show vertical steps across gaps. */
function densifyDailySupply(points) {
  if (points.length < 2) return points;
  const sorted = [...points].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const out = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const prevDate = new Date(prev.date);
    const currDate = new Date(curr.date);
    const dayGap = Math.round((currDate.getTime() - prevDate.getTime()) / 86400000);

    if (dayGap > 1) {
      const supplyStep = (curr.circulating - prev.circulating) / dayGap;
      for (let d = 1; d < dayGap; d++) {
        const dt = new Date(prevDate);
        dt.setUTCDate(dt.getUTCDate() + d);
        out.push({
          date: dt.toISOString(),
          circulating: prev.circulating + supplyStep * d,
          height: prev.height,
        });
      }
    }
    out.push({ ...curr });
  }
  return out;
}

function registerNetworkAnalyticsRoutes(router) {
  router.get('/api/network/halving', async (req, res) => {
    try {
      const pool = req.app.locals.pool;
      const callZebraRPC = req.app.locals.callZebraRPC;
      const redisClient = req.app.locals.redisClient;
      const cached = await getFromRedisCache(redisClient, HALVING_CACHE_KEY);
      if (cached) return res.json({ success: true, ...cached, cached: true });

      const heightRow = await pool.query('SELECT MAX(height) AS height FROM blocks');
      const currentHeight = parseInt(heightRow.rows[0]?.height, 10) || 0;
      const halving = await discoverNextHalving(callZebraRPC, currentHeight);

      const avgBlockTime = 75;
      const estimatedSeconds = halving.blocksRemaining != null ? halving.blocksRemaining * avgBlockTime : null;
      const payload = {
        ...halving,
        currentHeight,
        estimatedSeconds,
        estimatedDate: estimatedSeconds
          ? new Date(Date.now() + estimatedSeconds * 1000).toISOString()
          : null,
      };

      if (setRedisCache) await setRedisCache(redisClient, HALVING_CACHE_KEY, payload, HALVING_CACHE_TTL);
      res.json({ success: true, ...payload, cached: false });
    } catch (error) {
      console.error('❌ [HALVING] Error:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch halving info' });
    }
  });

  router.get('/api/network/mining-metrics', async (req, res) => {
    try {
      const pool = req.app.locals.pool;
      const window = Math.min(Math.max(parseInt(req.query.window, 10) || 20, 5), 100);
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 120, 20), 500);

      const result = await pool.query(
        `SELECT height, difficulty, timestamp, transaction_count, total_fees
         FROM blocks
         ORDER BY height DESC
         LIMIT $1`,
        [limit]
      );

      const rows = result.rows.reverse();
      const intervals = rows.map((r, i) => {
        if (i === 0) return 75;
        const prev = rows[i - 1];
        const delta = parseInt(r.timestamp, 10) - parseInt(prev.timestamp, 10);
        return delta > 0 && delta < 600 ? delta : 75;
      });

      const difficulties = rows.map((r) => parseFloat(r.difficulty) || 0);
      const solrates = difficulties.map((d, i) => d / intervals[i]);
      const fees = rows.map((r) => (parseInt(r.total_fees, 10) || 0) / 1e8);
      const txCounts = rows.map((r) => parseInt(r.transaction_count, 10) || 0);

      const rollDiff = rollingAverage(difficulties, window);
      const rollSolrate = rollingAverage(solrates, window);
      const rollBlockTime = rollingAverage(intervals, window);
      const rollFees = rollingAverage(fees, window);
      const rollTx = rollingAverage(txCounts, window);

      const points = rows.map((r, i) => ({
        height: parseInt(r.height, 10),
        difficulty: rollDiff[i],
        solrate: rollSolrate[i],
        blockTime: rollBlockTime[i],
        txFees: rollFees[i],
        txCount: rollTx[i],
      }));

      const latest = points[points.length - 1] || {};

      res.json({
        success: true,
        window,
        latest: {
          solrate: latest.solrate ?? 0,
          difficulty: latest.difficulty ?? 0,
          blockTime: latest.blockTime ?? 75,
          txFees: latest.txFees ?? 0,
          txCount: latest.txCount ?? 0,
        },
        points,
      });
    } catch (error) {
      console.error('❌ [MINING-METRICS] Error:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch mining metrics' });
    }
  });

  router.get('/api/network/pool-history', async (req, res) => {
    try {
      const pool = req.app.locals.pool;
      const period = req.query.period || '1y';
      const format = req.query.format || 'zec'; // 'zec' (default) or 'zatoshi'
      const useZat = format === 'zatoshi';
      const interval = periodToInterval(period);
      const hasPoolCols = await columnExists(pool, 'privacy_trends_daily', 'orchard_pool_size');

      const cols = hasPoolCols
        ? `date, pool_size, shielded_percentage, chain_supply,
           sprout_pool_size, sapling_pool_size, orchard_pool_size, transparent_pool_size`
        : `date, pool_size, shielded_percentage`;

      const result = await pool.query(
        `SELECT ${cols}
         FROM privacy_trends_daily
         WHERE date >= CURRENT_DATE - INTERVAL '${interval}'
         ORDER BY date ASC`
      );

      const ZAT = 1e8;
      const points = result.rows.map((r) => {
        const sproutZat = hasPoolCols ? (parseInt(r.sprout_pool_size, 10) || 0) : 0;
        const saplingZat = hasPoolCols ? (parseInt(r.sapling_pool_size, 10) || 0) : 0;
        const orchardZat = hasPoolCols ? (parseInt(r.orchard_pool_size, 10) || 0) : 0;
        const transparentZat = hasPoolCols ? (parseInt(r.transparent_pool_size, 10) || 0) : 0;
        const shieldedZat = parseInt(r.pool_size, 10) || 0;
        const chainSupplyZat = hasPoolCols ? (parseInt(r.chain_supply, 10) || 0) : 0;

        if (useZat) {
          return {
            date: r.date,
            shieldedZat: shieldedZat.toString(),
            sproutZat: sproutZat.toString(),
            saplingZat: saplingZat.toString(),
            orchardZat: orchardZat.toString(),
            transparentZat: transparentZat.toString(),
            chainSupplyZat: chainSupplyZat > 0 ? chainSupplyZat.toString() : null,
            shieldedSupplyPct: computeShieldedSupplyPct({
              shieldedZat,
              chainSupplyZat,
              sproutZat,
              saplingZat,
              orchardZat,
              transparentZat,
            }),
            hasPoolBreakdown: hasPoolCols,
          };
        }

        const shielded = shieldedZat / ZAT;
        const chainSupply = chainSupplyZat / ZAT;

        return {
          date: r.date,
          shielded,
          sprout: sproutZat / ZAT,
          sapling: saplingZat / ZAT,
          orchard: orchardZat / ZAT,
          transparent: transparentZat / ZAT,
          chainSupply: chainSupply > 0 ? chainSupply : null,
          shieldedSupplyPct: computeShieldedSupplyPct({
            shieldedZat,
            chainSupplyZat,
            sproutZat,
            saplingZat,
            orchardZat,
            transparentZat,
          }),
          hasPoolBreakdown: hasPoolCols,
        };
      });

      const verifiedPerPool = hasPoolCols ? await hasVerifiedPerPoolBreakdown(pool) : false;

      res.json({
        success: true,
        period,
        format,
        points,
        hasPoolBreakdown: hasPoolCols,
        hasVerifiedPerPoolBreakdown: verifiedPerPool,
      });
    } catch (error) {
      console.error('❌ [POOL-HISTORY] Error:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch pool history' });
    }
  });

  router.get('/api/network/emission', async (req, res) => {
    try {
      const pool = req.app.locals.pool;
      const callZebraRPC = req.app.locals.callZebraRPC;
      const period = req.query.period || '1y';
      const interval = periodToInterval(period);

      let supplyPoints = [];
      if (await tableExists(pool, 'chain_snapshots')) {
        const snap = await pool.query(
          `SELECT snapshot_time, chain_supply_zat, block_height
           FROM chain_snapshots
           WHERE snapshot_time >= NOW() - INTERVAL '${interval}'
           ORDER BY snapshot_time ASC`
        );
        supplyPoints = snap.rows.map((r) => ({
          date: r.snapshot_time,
          circulating: (parseInt(r.chain_supply_zat, 10) || 0) / 1e8,
          height: parseInt(r.block_height, 10),
        }));
      }

      const trends = await pool.query(
        `SELECT date, pool_size, chain_supply
         FROM privacy_trends_daily
         WHERE date >= CURRENT_DATE - INTERVAL '${interval}'
         ORDER BY date ASC`
      );

      // Fall back to daily privacy trends when snapshots are new or sparse
      if (supplyPoints.length < 2) {
        const fromTrends = trends.rows
          .filter((r) => (parseInt(r.chain_supply, 10) || 0) > 0)
          .map((r) => ({
            date: r.date,
            circulating: parseInt(r.chain_supply, 10) / 1e8,
          }));
        if (fromTrends.length > supplyPoints.length) {
          supplyPoints = fromTrends;
        }
      }

      supplyPoints = enforceMonotonicSupply(
        densifyDailySupply(
          supplyPoints.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        )
      );

      const dailyEmission = [];
      for (let i = 1; i < trends.rows.length; i++) {
        const prev = parseInt(trends.rows[i - 1].chain_supply, 10) || 0;
        const curr = parseInt(trends.rows[i].chain_supply, 10) || 0;
        if (prev > 0 && curr > prev) {
          dailyEmission.push({
            date: trends.rows[i].date,
            emission: (curr - prev) / 1e8,
          });
        }
      }

      const latestSupply = supplyPoints.length > 0
        ? supplyPoints[supplyPoints.length - 1].circulating
        : (parseInt(trends.rows[trends.rows.length - 1]?.chain_supply, 10) || 0) / 1e8;

      const subsidy = await callZebraRPC('getblocksubsidy').catch(() => null);
      const dailyEstimate = subsidy?.totalblocksubsidy != null ? subsidy.totalblocksubsidy * 1152 : null;

      res.json({
        success: true,
        maxSupply: MAX_SUPPLY_ZEC,
        circulating: latestSupply,
        remaining: Math.max(0, MAX_SUPPLY_ZEC - latestSupply),
        circulatingPct: latestSupply > 0 ? (latestSupply / MAX_SUPPLY_ZEC) * 100 : 0,
        dailyEmissionEstimate: dailyEstimate,
        supplyHistory: supplyPoints,
        dailyEmission,
        hasChainSnapshots: await tableExists(pool, 'chain_snapshots'),
        supplyHistorySource: supplyPoints.length >= 2 ? 'history' : supplyPoints.length === 1 ? 'partial' : 'none',
      });
    } catch (error) {
      console.error('❌ [EMISSION] Error:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch emission data' });
    }
  });

  router.get('/api/network/chain-size-history', async (req, res) => {
    try {
      const pool = req.app.locals.pool;
      if (!(await tableExists(pool, 'chain_snapshots'))) {
        return res.json({ success: true, points: [], available: false });
      }

      const period = req.query.period || '90d';
      const interval = periodToInterval(period);

      const result = await pool.query(
        `SELECT snapshot_time, chain_size_bytes, block_height
         FROM chain_snapshots
         WHERE snapshot_time >= NOW() - INTERVAL '${interval}'
         ORDER BY snapshot_time ASC`
      );

      res.json({
        success: true,
        available: true,
        period,
        points: result.rows.map((r) => ({
          time: r.snapshot_time,
          sizeBytes: parseInt(r.chain_size_bytes, 10) || 0,
          sizeGB: (parseInt(r.chain_size_bytes, 10) || 0) / (1024 ** 3),
          height: parseInt(r.block_height, 10),
        })),
      });
    } catch (error) {
      console.error('❌ [CHAIN-SIZE] Error:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch chain size history' });
    }
  });

  router.get('/api/network/blocks/recent', async (req, res) => {
    try {
      const pool = req.app.locals.pool;
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 15, 1), 50);

      const result = await pool.query(
        `SELECT
          b.height, b.hash, b.timestamp, b.transaction_count, b.size,
          b.miner_address, b.total_fees,
          c.total_output AS coinbase_zat
         FROM blocks b
         LEFT JOIN transactions c ON c.block_height = b.height AND c.is_coinbase = true
         ORDER BY b.height DESC
         LIMIT $1`,
        [limit]
      );

      res.json({
        success: true,
        blocks: result.rows.map((r) => ({
          height: parseInt(r.height, 10),
          hash: r.hash,
          timestamp: parseInt(r.timestamp, 10),
          txCount: parseInt(r.transaction_count, 10) || 0,
          size: parseInt(r.size, 10) || 0,
          minerAddress: r.miner_address,
          fees: (parseInt(r.total_fees, 10) || 0) / 1e8,
          minerReward: (parseInt(r.coinbase_zat, 10) || 0) / 1e8,
        })),
      });
    } catch (error) {
      console.error('❌ [RECENT-BLOCKS] Error:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch recent blocks' });
    }
  });
}

module.exports = { registerNetworkAnalyticsRoutes };
