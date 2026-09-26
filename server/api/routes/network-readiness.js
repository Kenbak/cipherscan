const { networkSchedule } = require('../lib/network-schedule');
const { cadencePoints } = require('../lib/block-cadence');
const { signedZat, blockAccounting } = require('../lib/network-accounting');
const { supplyZat } = require('../lib/network-issuance');
const { logSafeError } = require('../lib/safe-log');
const cadenceCache = new WeakMap();

function registerNetworkReadinessRoutes(router) {
  router.get('/api/network/block-time', async (req, res) => {
    const period = req.query.period ?? '24h';
    if (!['6h', '24h', '7d'].includes(period)) return res.status(400).json({ success: false, error: 'period must be 6h, 24h or 7d' });
    const seconds = { '6h': 21600, '24h': 86400, '7d': 604800 }[period];
    try {
      const { pool, callZebraRPC } = req.app.locals;
      let cache = cadenceCache.get(pool);
      if (!cache) { cache = new Map(); cadenceCache.set(pool, cache); }
      const cached = cache.get(period);
      res.set('Cache-Control', 'public, max-age=15');
      if (cached && cached.expires > Date.now()) return res.json(cached.payload);
      const info = await callZebraRPC('getblockchaininfo');
      const schedule = networkSchedule(info);
      const since = Math.floor(Date.now() / 1000) - seconds;
      // Read a bounded height-index range, including predecessor intervals.
      // Avoid a timestamp/min-height plan that scans the entire chain.
      // Bound the response even on unusually
      // fast test networks; the caller can see truncation rather than fake gaps.
      const { rows } = await pool.query(`SELECT height, timestamp FROM blocks
        ORDER BY height DESC LIMIT 40001`);
      const truncated = rows.length > 40000 && Number(rows[39999].timestamp) >= since;
      const points = cadencePoints(rows.slice(0, 40000), schedule, since);
      const step = Math.max(1, Math.ceil(points.length / 800));
      const payload = { success: true, period, source: 'canonical-block-header-timestamps',
        observedAt: new Date().toISOString(), schedule, rollingIntervals: 120,
        nodeHeight: info.blocks, indexedHeight: rows[0] ? Number(rows[0].height) : null,
        truncated, downsampleEvery: step, points: points.filter((point, i) => i % step === 0 || i === points.length - 1 || (schedule?.nu7Height != null && (point.height === schedule.nu7Height || point.height === schedule.nu7Height - 1))) };
      cache.set(period, { expires: Date.now() + 15000, payload });
      return res.json(payload);
    } catch (error) {
      logSafeError('[BLOCK-TIME]', error);
      res.set('Cache-Control', 'no-store');
      return res.status(503).json({ success: false, error: 'Block time observations unavailable' });
    }
  });

  router.get('/api/network/accounting', async (req, res) => {
    try {
      const { pool, callZebraRPC } = req.app.locals;
      const info = await callZebraRPC('getblockchaininfo');
      const schedule = networkSchedule(info);
      const { rows } = await pool.query(`WITH tip AS (
        SELECT height, hash, transaction_count FROM blocks WHERE height <= $1 ORDER BY height DESC LIMIT 1
      ) SELECT b.height, b.hash, b.transaction_count, count(t.txid) AS tx_count,
        count(*) FILTER (WHERE t.is_coinbase) AS coinbases,
        count(*) FILTER (WHERE NOT t.is_coinbase AND (t.fee IS NULL OR t.fee < 0)) AS invalid_fees,
        coalesce(sum(t.fee) FILTER (WHERE NOT t.is_coinbase), 0)::text AS fees,
        (sum(t.total_output - t.value_balance_sapling - t.value_balance_orchard - t.value_balance_ironwood)
          FILTER (WHERE t.is_coinbase))::text AS coinbase_value
        FROM tip b LEFT JOIN transactions t ON t.block_height = b.height AND t.block_hash = b.hash
        GROUP BY b.height, b.hash, b.transaction_count`, [info.blocks]);
      let block = null;
      if (rows[0]) {
        const height = Number(rows[0].height);
        const [hash, subsidy] = await Promise.all([
          callZebraRPC('getblockhash', [height]), callZebraRPC('getblocksubsidy', [height]).catch(() => null),
        ]);
        if (hash === rows[0].hash) block = blockAccounting(rows[0], subsidy, schedule);
      }
      res.set('Cache-Control', 'no-store');
      return res.json({ success: true, observedAt: new Date().toISOString(), schedule,
        nodeHeight: info.blocks, nodeHash: info.bestblockhash,
        circulatingSupplyZat: supplyZat(info.chainSupply?.chainValueZat),
        nsmBalanceZat: signedZat(info.nsmValueBalanceZat), nsmSource: 'getblockchaininfo.nsmValueBalanceZat',
        nsmMeaning: 'Separate signed reserve counter; excluded from circulating supply.',
        block, blockUnavailableReason: block ? null : 'Indexed block unavailable or canonical hash mismatch.' });
    } catch (error) {
      logSafeError('[NETWORK-ACCOUNTING]', error);
      res.set('Cache-Control', 'no-store');
      return res.status(503).json({ success: false, error: 'Network accounting unavailable' });
    }
  });
}
module.exports = { registerNetworkReadinessRoutes };
