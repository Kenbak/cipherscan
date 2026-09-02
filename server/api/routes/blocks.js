/**
 * Block Routes
 * /health, /health/deep, /api/info, /api/blocks, /api/block/:height
 */

const express = require('express');
const router = express.Router();
const { getPoolName, getPoolInfo } = require('../mining-pools');
const { decodeCoinbaseText } = require('../coinbase-data');
const { applyListCacheHeaders, createListCache } = require('../list-cache');

const disabledListCache = createListCache({ enabled: false });

function isCanonicalIntegerQuery(value) {
  if (value === undefined) return true;
  if (typeof value !== 'string' || !/^-?\d+$/.test(value)) return false;
  return Number.isSafeInteger(Number.parseInt(value, 10));
}

function isKnownDirection(value) {
  return value === undefined || value === 'next' || value === 'prev';
}

let pool;
let redisClient;
let callZebraRPC;
let listCache;
let chainTip;

router.use((req, res, next) => {
  pool = req.app.locals.pool;
  redisClient = req.app.locals.redisClient;
  callZebraRPC = req.app.locals.callZebraRPC;
  listCache = req.app.locals.listCache || disabledListCache;
  chainTip = req.app.locals.chainTip || { height: 0, hash: '' };
  next();
});

const CROSSLINK_CACHE_KEY = 'crosslink:stats';

let hasStakingColumns = null;
async function checkStakingColumns(db) {
  if (hasStakingColumns !== null) return hasStakingColumns;
  try {
    const result = await db.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'transactions' AND column_name = 'staking_action_type'`
    );
    hasStakingColumns = result.rows.length > 0;
  } catch {
    hasStakingColumns = false;
  }
  return hasStakingColumns;
}

async function getFinalizedHeight() {
  if (redisClient && redisClient.isOpen) {
    try {
      const cached = await redisClient.get(CROSSLINK_CACHE_KEY);
      if (cached) {
        const data = JSON.parse(cached);
        if (typeof data.finalizedHeight === 'number') return data.finalizedHeight;
      }
    } catch (e) { /* ignore */ }
  }

  if (typeof callZebraRPC === 'function') {
    try {
      const result = await callZebraRPC('get_tfl_final_block_height_and_hash');
      if (result) return result.height ?? result[0] ?? null;
    } catch (e) { /* ignore */ }
  }

  return null;
}

// ============================================================================
// HEALTH & INFO
// ============================================================================

// Health check — fast liveness probe for Docker/LB
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Deep health check — external monitoring (Better Stack, status page)
router.get('/health/deep', async (req, res) => {
  const checks = {};
  let critical = false;
  let degraded = false;

  // PostgreSQL primary (write pool)
  const writePool = req.app.locals.writePool || pool;
  try {
    const start = Date.now();
    await Promise.race([
      writePool.query('SELECT 1'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);
    checks.database = { status: 'up', latency_ms: Date.now() - start };
  } catch {
    checks.database = { status: 'down' };
    critical = true;
  }

  // PostgreSQL replica + circuit breaker
  const routing = req.app.locals.poolRouting;
  if (routing && routing.hasReplica()) {
    const circuit = routing.getCircuitState();
    try {
      const lagBlocks = await routing.replicaLagBlocks();
      checks.replica = {
        status: circuit.state === 'OPEN' ? 'circuit_open' : 'up',
        lag_blocks: lagBlocks,
        circuit: circuit.state,
        failures: circuit.consecutiveFailures,
      };
      if (lagBlocks > 3 || circuit.state !== 'CLOSED') degraded = true;
    } catch {
      checks.replica = { status: 'down', circuit: circuit.state, failures: circuit.consecutiveFailures };
      degraded = true;
    }
  } else {
    checks.replica = { status: 'not_configured' };
  }

  // Redis
  if (redisClient) {
    try {
      if (redisClient.isOpen) {
        await Promise.race([
          redisClient.ping(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
        ]);
        checks.redis = { status: 'up' };
      } else {
        checks.redis = { status: 'down' };
        degraded = true;
      }
    } catch {
      checks.redis = { status: 'down' };
      degraded = true;
    }
  } else {
    checks.redis = { status: 'not_configured' };
  }

  // Zakura/Zebra node via RPC
  try {
    const nodeHeight = await Promise.race([
      callZebraRPC('getblockcount'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
    ]);
    let dbTip = chainTip.height || 0;
    if (dbTip === 0 && checks.database.status === 'up') {
      try {
        const tipResult = await writePool.query(
          "SELECT value::bigint AS h FROM indexer_state WHERE key = 'last_indexed_height'"
        );
        if (tipResult.rows.length > 0) dbTip = Number(tipResult.rows[0].h);
      } catch { /* fall through with 0 */ }
    }
    const nodeLag = Math.abs(nodeHeight - dbTip);
    checks.node = { status: 'up', height: nodeHeight, db_height: dbTip };
    if (dbTip > 0 && nodeLag > 10) degraded = true;
  } catch {
    checks.node = { status: 'down' };
    critical = true;
  }

  const status = critical ? 'unhealthy' : degraded ? 'degraded' : 'healthy';
  const httpCode = critical ? 503 : 200;

  res.status(httpCode).json({
    status,
    checks,
    timestamp: new Date().toISOString(),
  });
});

// Get blockchain info (current height, etc.)
router.get('/api/info', async (req, res) => {
  try {
    const result = await pool.query('SELECT MAX(height) as max_height FROM blocks');
    // pg returns BIGINT columns as strings; block height is always well within
    // Number.MAX_SAFE_INTEGER, so coerce here instead of leaking a string to
    // every consumer of this "numeric info" endpoint.
    const currentHeight = Number(result.rows[0]?.max_height ?? 0);

    res.json({
      blocks: currentHeight,
      height: currentHeight,
    });
  } catch (error) {
    console.error('Error fetching blockchain info:', error);
    res.status(500).json({ error: 'Failed to fetch blockchain info' });
  }
});

// ============================================================================
// BLOCK LIST (cursor-based pagination for /blocks page)
// ============================================================================

router.get('/api/blocks/list', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100);
    const cursor = req.query.cursor ? parseInt(req.query.cursor) : null;
    const direction = req.query.direction || 'next'; // 'next' = older, 'prev' = newer
    const normalizedDirection = direction === 'prev' ? 'prev' : 'next';
    const isLatest = cursor === null;
    const cacheable = isCanonicalIntegerQuery(req.query.limit)
      && isCanonicalIntegerQuery(req.query.cursor)
      && isKnownDirection(req.query.direction);

    const cached = await listCache.getOrLoad({
      family: 'blocks-list',
      params: {
        limit,
        cursor: Number.isFinite(cursor) ? cursor : null,
        direction: isLatest ? 'next' : normalizedDirection,
        tipHeight: chainTip.height,
      },
      freshTtlSeconds: isLatest ? 15 : 300,
      staleTtlSeconds: isLatest ? 300 : 3600,
      cacheable,
      shouldCache: value => value?.success === true,
      load: async ({ measure }) => {
        // Get max height for page calculation
        const maxResult = await measure(
          'db_max_height',
          () => pool.query('SELECT MAX(height) as max_height FROM blocks')
        );
        const maxHeight = parseInt(maxResult.rows[0]?.max_height) || 0;

        let result;
        if (cursor === null) {
          result = await measure(
            'db_blocks',
            () => pool.query(
              `SELECT height, hash, timestamp, transaction_count, size, difficulty, miner_address, coinbase_hex, total_fees
               FROM blocks ORDER BY height DESC LIMIT $1`,
              [limit]
            )
          );
        } else if (direction === 'prev') {
          result = await measure(
            'db_blocks',
            () => pool.query(
              `SELECT height, hash, timestamp, transaction_count, size, difficulty, miner_address, coinbase_hex, total_fees
               FROM blocks WHERE height > $1 ORDER BY height ASC LIMIT $2`,
              [cursor, limit]
            )
          );
          result.rows.reverse();
        } else {
          result = await measure(
            'db_blocks',
            () => pool.query(
              `SELECT height, hash, timestamp, transaction_count, size, difficulty, miner_address, coinbase_hex, total_fees
               FROM blocks WHERE height < $1 ORDER BY height DESC LIMIT $2`,
              [cursor, limit]
            )
          );
        }

        const finalizedHeight = await measure('finality', () => getFinalizedHeight());
        const rows = result.rows.map(b => {
          if (finalizedHeight !== null) {
            b.finality_status = parseInt(b.height) <= finalizedHeight ? 'Finalized' : 'NotYetFinalized';
          }
          b.miner_pool = getPoolName(b.miner_address);
          return b;
        });
        const firstHeight = rows.length > 0 ? parseInt(rows[0].height) : null;
        const lastHeight = rows.length > 0 ? parseInt(rows[rows.length - 1].height) : null;

        const page = firstHeight !== null ? Math.floor((maxHeight - firstHeight) / limit) + 1 : 1;
        const totalPages = Math.ceil(maxHeight / limit);

        return {
          success: true,
          blocks: rows,
          pagination: {
            page,
            totalPages,
            total: maxHeight,
            limit,
            hasNext: lastHeight !== null && lastHeight > 1,
            hasPrev: firstHeight !== null && firstHeight < maxHeight,
            nextCursor: lastHeight,
            prevCursor: firstHeight,
          },
        };
      },
    });

    applyListCacheHeaders(res, cached);
    res.json(cached.value);
  } catch (error) {
    console.error('Error fetching blocks list:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch blocks' });
  }
});

// ============================================================================
// BLOCK ROUTES
// ============================================================================

// Get recent blocks
router.get('/api/blocks', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    const result = await pool.query(
      `SELECT
        height,
        hash,
        timestamp,
        transaction_count,
        size,
        difficulty,
        miner_address,
        total_fees
      FROM blocks
      ORDER BY height DESC
      LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const [countResult, finalizedHeight] = await Promise.all([
      pool.query('SELECT MAX(height) as max_height FROM blocks'),
      getFinalizedHeight(),
    ]);
    const totalBlocks = countResult.rows[0]?.max_height || 0;

    const blocks = result.rows.map(b => {
      if (finalizedHeight !== null) {
        b.finality_status = parseInt(b.height) <= finalizedHeight ? 'Finalized' : 'NotYetFinalized';
      }
      b.miner_pool = getPoolName(b.miner_address);
      return b;
    });

    res.json({
      blocks,
      pagination: {
        limit,
        offset,
        total: totalBlocks,
        hasMore: offset + limit < totalBlocks,
      },
    });
  } catch (error) {
    console.error('Error fetching blocks:', error);
    res.status(500).json({ error: 'Failed to fetch blocks' });
  }
});

function parseBlockIdentifier(param) {
  if (/^[a-fA-F0-9]{64}$/.test(param)) {
    return { type: 'hash', value: param.toLowerCase() };
  }
  if (/^\d+$/.test(param)) {
    const height = parseInt(param, 10);
    if (height < 0 || height > 100_000_000) return null;
    return { type: 'height', value: height };
  }
  return null;
}

async function fetchCanonicalBlockSummary(blockHeight) {
  const result = await pool.query(
    `SELECT height, hash, timestamp, transaction_count, size, miner_address
     FROM blocks WHERE height = $1`,
    [blockHeight]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  const poolInfo = getPoolInfo(row.miner_address);
  return {
    height: parseInt(row.height),
    hash: row.hash,
    timestamp: parseInt(row.timestamp),
    transaction_count: row.transaction_count,
    size: row.size,
    miner_address: row.miner_address,
    miner_pool: poolInfo?.name || null,
    miner_pool_url: poolInfo?.url || null,
    miner_pool_region: poolInfo?.region || null,
    miner_pool_is_funding_stream: poolInfo?.isFundingStream || false,
  };
}

async function buildOrphanedBlockResponse(orphanRow) {
  const blockHeight = parseInt(orphanRow.height);
  const blockHash = orphanRow.hash;
  const canonicalBlock = await fetchCanonicalBlockSummary(blockHeight);
  const poolInfo = getPoolInfo(orphanRow.miner_address);

  let transactions = [];
  try {
    const txResult = await pool.query(
      `SELECT txid, block_height, tx_index, version, size, fee, is_coinbase,
              vin_count, vout_count, total_input, total_output,
              has_sapling, has_orchard, has_sprout, has_ironwood, has_shielded_data,
              sapling_spend_count, sapling_output_count, orchard_actions, ironwood_actions,
              sprout_joinsplit_count,
              value_balance, value_balance_sapling, value_balance_orchard, value_balance_ironwood,
              flow_type, privacy_score, "timestamp", expiry_height
       FROM orphaned_transactions
       WHERE block_hash = $1
       ORDER BY tx_index ASC`,
      [blockHash]
    );

    for (const tx of txResult.rows) {
      const inputsResult = await pool.query(
        `SELECT vout_index, prev_txid, prev_vout, address, value, coinbase
         FROM orphaned_transaction_inputs WHERE txid = $1 AND block_hash = $2
         ORDER BY vout_index ASC`,
        [tx.txid, blockHash]
      );
      const outputsResult = await pool.query(
        `SELECT vout_index, value, address, script_type
         FROM orphaned_transaction_outputs WHERE txid = $1 AND block_hash = $2
         ORDER BY vout_index ASC`,
        [tx.txid, blockHash]
      );

      transactions.push({
        txid: tx.txid,
        block_height: parseInt(tx.block_height),
        tx_index: tx.tx_index,
        version: tx.version,
        size: tx.size,
        fee: tx.fee ? parseInt(tx.fee) : 0,
        is_coinbase: tx.is_coinbase,
        timestamp: tx.timestamp ? parseInt(tx.timestamp) : null,
        expiry_height: tx.expiry_height,
        vin_count: tx.vin_count || 0,
        vout_count: tx.vout_count || 0,
        total_input: tx.total_input ? parseInt(tx.total_input) : 0,
        total_output: tx.total_output ? parseInt(tx.total_output) : 0,
        has_sapling: tx.has_sapling,
        has_orchard: tx.has_orchard,
        has_sprout: tx.has_sprout,
        has_ironwood: tx.has_ironwood,
        has_shielded_data: tx.has_shielded_data,
        sapling_spend_count: tx.sapling_spend_count || 0,
        sapling_output_count: tx.sapling_output_count || 0,
        orchard_actions: tx.orchard_actions || 0,
        ironwood_actions: tx.ironwood_actions || 0,
        sprout_joinsplit_count: tx.sprout_joinsplit_count || 0,
        value_balance: tx.value_balance ? parseInt(tx.value_balance) : 0,
        value_balance_sapling: tx.value_balance_sapling ? parseInt(tx.value_balance_sapling) : 0,
        value_balance_orchard: tx.value_balance_orchard ? parseInt(tx.value_balance_orchard) : 0,
        value_balance_ironwood: tx.value_balance_ironwood ? parseInt(tx.value_balance_ironwood) : 0,
        flow_type: tx.flow_type,
        privacy_score: tx.privacy_score,
        vin: inputsResult.rows.map(i => ({
          vout_index: i.vout_index,
          prev_txid: i.prev_txid,
          prev_vout: i.prev_vout,
          address: i.address,
          value: i.value ? parseInt(i.value) : 0,
          coinbase: i.coinbase,
        })),
        vout: outputsResult.rows.map(o => ({
          vout_index: o.vout_index,
          value: o.value ? parseInt(o.value) : 0,
          address: o.address,
          script_type: o.script_type,
        })),
      });
    }
  } catch (err) {
    console.error('[BLOCK] Failed to load orphaned transactions:', err.message);
  }

  return {
    height: blockHeight,
    hash: blockHash,
    timestamp: orphanRow.timestamp ? parseInt(orphanRow.timestamp) : null,
    transaction_count: orphanRow.transaction_count || 0,
    size: orphanRow.size || 0,
    difficulty: orphanRow.difficulty,
    previous_block_hash: orphanRow.previous_block_hash,
    miner_address: orphanRow.miner_address,
    isOrphaned: true,
    orphanSource: orphanRow.source,
    orphanDetectedAt: orphanRow.detected_at,
    canonicalBlock,
    transactions,
    transactionCount: orphanRow.transaction_count || 0,
    confirmations: 0,
    miner_pool: poolInfo?.name || null,
    miner_pool_url: poolInfo?.url || null,
    miner_pool_region: poolInfo?.region || null,
    miner_pool_is_funding_stream: poolInfo?.isFundingStream || false,
  };
}

// Get block by height or hash
router.get('/api/block/:heightOrHash', async (req, res) => {
  try {
    const param = req.params.heightOrHash;
    const identifier = parseBlockIdentifier(param);

    if (!identifier) {
      return res.status(400).json({ error: 'Invalid block height or hash' });
    }

    const isHash = identifier.type === 'hash';
    const height = isHash ? null : identifier.value;

    // Get block details by height or hash
    const blockResult = await pool.query(
      `SELECT
        height,
        hash,
        timestamp,
        transaction_count,
        size,
        difficulty,
        previous_block_hash,
        version,
        merkle_root,
        final_sapling_root,
        final_orchard_root,
        final_ironwood_root,
        bits,
        nonce,
        solution,
        total_fees,
        miner_address,
        coinbase_hex
      FROM blocks
      WHERE ${isHash ? 'hash = $1' : 'height = $1'}`,
      [isHash ? identifier.value : height]
    );

    // Hash lookup: fall back to orphaned_blocks if not on canonical chain
    if (blockResult.rows.length === 0 && isHash) {
      const orphanResult = await pool.query(
        `SELECT height, hash, timestamp, transaction_count, size, difficulty,
                miner_address, previous_block_hash, source, detected_at
         FROM orphaned_blocks WHERE hash = $1`,
        [identifier.value]
      );

      if (orphanResult.rows.length === 0) {
        return res.status(404).json({ error: 'Block not found' });
      }

      return res.json(await buildOrphanedBlockResponse(orphanResult.rows[0]));
    }

    if (blockResult.rows.length === 0) {
      return res.status(404).json({ error: 'Block not found' });
    }

    const block = blockResult.rows[0];
    const blockHeight = parseInt(block.height);

    // The server-rendered block page only needs enough data to establish the
    // canonical URL and render a meaningful summary. Loading every transaction,
    // input, and output here made crawler requests fan out into expensive detail
    // queries and caused historical block pages to time out under concurrent
    // crawling. Keep the full response as the default for API consumers.
    if (req.query.summary === '1') {
      const poolInfo = getPoolInfo(block.miner_address);
      const transactionCount = Number(block.transaction_count) || 0;

      res.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=300');
      return res.json({
        height: blockHeight,
        hash: block.hash,
        timestamp: block.timestamp ? parseInt(block.timestamp) : null,
        transaction_count: transactionCount,
        transactionCount,
        size: Number(block.size) || 0,
        isOrphaned: false,
        miner_address: block.miner_address,
        miner_pool: poolInfo?.name || null,
        miner_pool_url: poolInfo?.url || null,
        miner_pool_region: poolInfo?.region || null,
        miner_pool_is_funding_stream: poolInfo?.isFundingStream || false,
      });
    }

    // Bind transactions to the block's immutable hash. Heights can identify
    // different blocks over time when the chain reorganizes.
    const staking = await checkStakingColumns(pool);
    const stakingCols = staking
      ? ', staking_action_type, staking_bond_key, staking_delegatee, staking_amount_zats'
      : '';
    const txResult = await pool.query(
      `SELECT
        txid, block_height, block_hash, block_time, size, version, locktime,
        vin_count, vout_count, value_balance, value_balance_sapling,
        value_balance_orchard, value_balance_ironwood,
        has_sapling, has_orchard, has_ironwood, has_sprout,
        ironwood_actions, orchard_actions, sapling_spend_count, sapling_output_count,
        fee, total_input, total_output, is_coinbase,
        tx_index${stakingCols}
      FROM transactions
      WHERE block_hash = $1
      ORDER BY tx_index`,
      [block.hash]
    );

    // Get all inputs and outputs for all transactions in this block (optimized: 2 queries instead of N)
    const txids = txResult.rows.map(tx => tx.txid);

    const [inputsResult, outputsResult] = await Promise.all([
      pool.query(
        `SELECT txid, prev_txid, prev_vout, address, value, vout_index
         FROM transaction_inputs
         WHERE txid = ANY($1::text[])
         ORDER BY txid, vout_index`,
        [txids]
      ),
      pool.query(
        `SELECT txid, address, value, vout_index, spent
         FROM transaction_outputs
         WHERE txid = ANY($1::text[])
         ORDER BY txid, vout_index`,
        [txids]
      )
    ]);

    // Group inputs and outputs by txid
    const inputsByTxid = {};
    const outputsByTxid = {};

    inputsResult.rows.forEach(input => {
      if (!inputsByTxid[input.txid]) {
        inputsByTxid[input.txid] = [];
      }
      inputsByTxid[input.txid].push(input);
    });

    outputsResult.rows.forEach(output => {
      if (!outputsByTxid[output.txid]) {
        outputsByTxid[output.txid] = [];
      }
      outputsByTxid[output.txid].push(output);
    });

    // Attach inputs and outputs to transactions
    const transactions = txResult.rows.map(tx => ({
      ...tx,
      inputs: inputsByTxid[tx.txid] || [],
      outputs: outputsByTxid[tx.txid] || [],
    }));

    const [currentHeightResult, finalizedHeight] = await Promise.all([
      pool.query('SELECT MAX(height) as max_height FROM blocks'),
      getFinalizedHeight(),
    ]);
    const currentHeight = currentHeightResult.rows[0]?.max_height || blockHeight;
    const confirmations = currentHeight - blockHeight + 1;

    const poolInfo = getPoolInfo(block.miner_address);
    const coinbaseText = decodeCoinbaseText(block.coinbase_hex);

    let nextBlockHash = null;
    if (blockHeight < currentHeight) {
      const nextResult = await pool.query(
        'SELECT hash FROM blocks WHERE height = $1',
        [blockHeight + 1]
      );
      nextBlockHash = nextResult.rows[0]?.hash || null;
    }

    const response = {
      ...block,
      next_block_hash: nextBlockHash,
      confirmations,
      transactions,
      transactionCount: transactions.length,
      isOrphaned: false,
      miner_pool: poolInfo?.name || null,
      miner_pool_url: poolInfo?.url || null,
      miner_pool_region: poolInfo?.region || null,
      miner_pool_is_funding_stream: poolInfo?.isFundingStream || false,
      coinbase_text: coinbaseText,
    };

    if (finalizedHeight !== null) {
      response.finality_status = blockHeight <= finalizedHeight ? 'Finalized' : 'NotYetFinalized';
    }

    res.json(response);
  } catch (error) {
    console.error('Error fetching block:', error);
    res.status(500).json({ error: 'Failed to fetch block' });
  }
});

// ============================================================================
// ANCHOR ROOT SEARCH (wallet debugging)
// ============================================================================

router.get('/api/search/anchor/:root', async (req, res) => {
  try {
    const { root } = req.params;

    if (!root || !/^[a-fA-F0-9]{64}$/.test(root)) {
      return res.status(400).json({ error: 'Invalid anchor root (expected 64-char hex)' });
    }

    const rootLower = root.toLowerCase();

    // Search canonical blocks — UNION to leverage separate indexes
    const canonicalResult = await pool.query(
      `(SELECT height, hash, timestamp, final_sapling_root, final_orchard_root, final_ironwood_root, miner_address
        FROM blocks WHERE final_sapling_root = $1 LIMIT 10)
       UNION ALL
       (SELECT height, hash, timestamp, final_sapling_root, final_orchard_root, final_ironwood_root, miner_address
        FROM blocks WHERE final_orchard_root = $1 LIMIT 10)
       UNION ALL
       (SELECT height, hash, timestamp, final_sapling_root, final_orchard_root, final_ironwood_root, miner_address
        FROM blocks WHERE final_ironwood_root = $1 LIMIT 10)
       ORDER BY height DESC LIMIT 10`,
      [rootLower]
    );

    // Search orphaned blocks
    const orphanResult = await pool.query(
      `(SELECT height, hash, timestamp, final_sapling_root, final_orchard_root, final_ironwood_root, miner_address, detected_at
        FROM orphaned_blocks WHERE final_sapling_root = $1 LIMIT 10)
       UNION ALL
       (SELECT height, hash, timestamp, final_sapling_root, final_orchard_root, final_ironwood_root, miner_address, detected_at
        FROM orphaned_blocks WHERE final_orchard_root = $1 LIMIT 10)
       UNION ALL
       (SELECT height, hash, timestamp, final_sapling_root, final_orchard_root, final_ironwood_root, miner_address, detected_at
        FROM orphaned_blocks WHERE final_ironwood_root = $1 LIMIT 10)
       ORDER BY height DESC LIMIT 10`,
      [rootLower]
    );

    function matchedPoolField(row) {
      if (row.final_ironwood_root === rootLower) return 'ironwood';
      if (row.final_orchard_root === rootLower) return 'orchard';
      return 'sapling';
    }

    const canonical = canonicalResult.rows.map(row => ({
      height: parseInt(row.height),
      hash: row.hash,
      timestamp: parseInt(row.timestamp),
      matchedField: matchedPoolField(row),
      minerAddress: row.miner_address,
      minerPool: getPoolName(row.miner_address),
      chain: 'canonical',
    }));

    const orphaned = orphanResult.rows.map(row => ({
      height: parseInt(row.height),
      hash: row.hash,
      timestamp: row.timestamp ? parseInt(row.timestamp) : null,
      matchedField: matchedPoolField(row),
      minerAddress: row.miner_address,
      minerPool: getPoolName(row.miner_address),
      chain: 'orphaned',
      detectedAt: row.detected_at,
    }));

    res.json({
      root: rootLower,
      found: canonical.length + orphaned.length > 0,
      canonical,
      orphaned,
      diagnosis: orphaned.length > 0 && canonical.length === 0
        ? 'This anchor root exists ONLY on orphaned fork(s). A wallet referencing this root is stuck on a dead fork and needs to rescan.'
        : canonical.length > 0
          ? 'This anchor root is on the canonical chain.'
          : 'This anchor root was not found. It may be from a very old block not yet backfilled, or an invalid root.',
    });
  } catch (error) {
    console.error('Error searching anchor root:', error);
    res.status(500).json({ error: 'Failed to search anchor root' });
  }
});

// Get archived raw block hex by hash or height
router.get('/api/block-archive/:hashOrHeight', async (req, res) => {
  try {
    const param = req.params.hashOrHeight;
    const isHeight = /^\d+$/.test(param);

    const result = await pool.query(
      `SELECT height, hash, raw_hex, reason, captured_at
       FROM block_archive
       WHERE ${isHeight ? 'height = $1' : 'hash = $1'}
       ORDER BY captured_at DESC`,
      [isHeight ? parseInt(param, 10) : param.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No archived block found' });
    }

    res.json({
      success: true,
      blocks: result.rows.map(r => ({
        height: Number(r.height),
        hash: r.hash,
        rawHex: r.raw_hex,
        reason: r.reason,
        capturedAt: r.captured_at,
        sizeBytes: r.raw_hex.length / 2,
      })),
    });
  } catch (error) {
    console.error('Error fetching block archive:', error);
    res.status(500).json({ error: 'Failed to fetch archived block' });
  }
});

module.exports = router;
