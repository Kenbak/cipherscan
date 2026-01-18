require('dotenv').config();
const { Pool } = require('pg');
const Redis = require('redis');
const fs = require('fs');

const config = {
  network: process.env.NETWORK || 'testnet',
  zebra: {
    url: process.env.ZEBRA_RPC_URL || 'http://127.0.0.1:18232',
    cookieFile: process.env.ZEBRA_RPC_COOKIE_FILE || '/root/.cache/zebra/.cookie',
  },
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'zcash_explorer_testnet',
    user: process.env.DB_USER || 'zcash_user',
    password: process.env.DB_PASSWORD,
    max: 50, // Increase pool size for parallel processing
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
};

const db = new Pool(config.db);

const redis = Redis.createClient({
  socket: {
    host: config.redis.host,
    port: config.redis.port,
  },
});
redis.connect().catch(console.error);

// Transaction cache to avoid repeated RPC calls
const txCache = new Map();
const CACHE_SIZE = 50000; // Larger cache for better hit rate

function cacheTx(txid, tx) {
  if (txCache.size >= CACHE_SIZE) {
    const firstKey = txCache.keys().next().value;
    txCache.delete(firstKey);
  }
  txCache.set(txid, tx);
}

/**
 * Calculate privacy score (0-100) based on multiple factors
 *
 * The score represents how "private" the Zcash blockchain is:
 * - 100 = All ZEC in shielded pools + All txs are fully shielded + All txs use shielded features
 * - 0 = No ZEC in shielded pools + No shielded transactions
 *
 * @param {object} params
 * @param {number} params.dailyShieldedPercent - % of today's txs that are shielded (unused, kept for compatibility)
 * @param {number} params.allTimeShieldedPercent - % of all txs that are shielded
 * @param {number} params.totalShieldedZat - Total ZEC in shielded pools (zatoshis)
 * @param {number} params.chainSupplyZat - Total chain supply (zatoshis)
 * @param {number} params.fullyShieldedTx - Count of fully shielded txs
 * @param {number} params.shieldedTx - Count of all shielded txs
 */
function calculatePrivacyScore(params) {
  const {
    allTimeShieldedPercent = 0,
    totalShieldedZat = 0,
    chainSupplyZat = 0,
    fullyShieldedTx = 0,
    shieldedTx = 0,
  } = params;

  // Factor 1: Supply Shielded Score (0-40 points)
  // How much of the total ZEC supply is in shielded pools?
  // 100% supply shielded = 40 pts
  const supplyShieldedPercent = chainSupplyZat > 0
    ? (totalShieldedZat / chainSupplyZat) * 100
    : 0;
  const supplyScore = Math.min(supplyShieldedPercent * 0.4, 40);

  // Factor 2: Fully Shielded Score (0-30 points)
  // What % of shielded txs are fully shielded (z-to-z)?
  // 100% fully shielded = 30 pts
  const fullyShieldedPercent = shieldedTx > 0
    ? (fullyShieldedTx / shieldedTx) * 100
    : 0;
  const fullyShieldedScore = Math.min(fullyShieldedPercent * 0.3, 30);

  // Factor 3: Shielded Tx Adoption Score (0-30 points)
  // What % of all txs use shielded features?
  // 100% shielded adoption = 30 pts
  const adoptionScore = Math.min(allTimeShieldedPercent * 0.3, 30);

  const totalScore = Math.round(supplyScore + fullyShieldedScore + adoptionScore);

  // Debug log (can be removed later)
  // console.log(`Privacy Score: supply=${supplyScore.toFixed(1)} (${supplyShieldedPercent.toFixed(1)}%) fully=${fullyShieldedScore.toFixed(1)} (${fullyShieldedPercent.toFixed(1)}%) adoption=${adoptionScore.toFixed(1)} (${allTimeShieldedPercent.toFixed(1)}%) = ${totalScore}`);

  return Math.min(totalScore, 100);
}

/**
 * Fetch current shielded pool sizes from Zebra RPC and update privacy_stats table
 * This ensures the anonymity set (currentSize) is always up-to-date
 */
async function updatePoolSizesFromZebra() {
  try {
    console.log('💰 Fetching fresh pool sizes from Zebra RPC...');

    const blockchainInfo = await zebradRPC('getblockchaininfo');

    if (!blockchainInfo || !blockchainInfo.valuePools) {
      console.warn('⚠️  Could not get valuePools from Zebra');
      return null;
    }

    let transparentPool = 0;
    let sproutPool = 0;
    let saplingPool = 0;
    let orchardPool = 0;
    let chainSupply = 0;

    for (const pool of blockchainInfo.valuePools) {
      const valueZat = parseInt(pool.chainValueZat) || 0;
      switch (pool.id) {
        case 'transparent':
          transparentPool = valueZat;
          break;
        case 'sprout':
          sproutPool = valueZat;
          break;
        case 'sapling':
          saplingPool = valueZat;
          break;
        case 'orchard':
          orchardPool = valueZat;
          break;
      }
    }

    // Total shielded = sprout + sapling + orchard
    const shieldedPoolSize = sproutPool + saplingPool + orchardPool;

    // Chain supply from chainSupply field
    if (blockchainInfo.chainSupply) {
      chainSupply = parseInt(blockchainInfo.chainSupply.chainValueZat) || 0;
    }

    const latestBlock = blockchainInfo.blocks || 0;

    // Update privacy_stats table with fresh pool sizes
    const existingStats = await db.query('SELECT id FROM privacy_stats ORDER BY updated_at DESC LIMIT 1');

    if (existingStats.rows.length > 0) {
      // Update existing record
      await db.query(`
        UPDATE privacy_stats SET
          shielded_pool_size = $1,
          sprout_pool_size = $2,
          sapling_pool_size = $3,
          orchard_pool_size = $4,
          transparent_pool_size = $5,
          chain_supply = $6,
          last_block_scanned = $7,
          updated_at = NOW()
        WHERE id = $8
      `, [
        shieldedPoolSize,
        sproutPool,
        saplingPool,
        orchardPool,
        transparentPool,
        chainSupply,
        latestBlock,
        existingStats.rows[0].id
      ]);
    } else {
      // Insert new record (first time)
      await db.query(`
        INSERT INTO privacy_stats (
          shielded_pool_size, sprout_pool_size, sapling_pool_size, orchard_pool_size,
          transparent_pool_size, chain_supply, last_block_scanned,
          total_blocks, total_transactions, shielded_tx, transparent_tx, coinbase_tx,
          mixed_tx, fully_shielded_tx, shielded_percentage, privacy_score,
          avg_shielded_per_day, adoption_trend, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'stable', NOW())
      `, [
        shieldedPoolSize,
        sproutPool,
        saplingPool,
        orchardPool,
        transparentPool,
        chainSupply,
        latestBlock
      ]);
    }

    console.log(`   ✓ Pool sizes updated: Shielded=${(shieldedPoolSize / 1e8).toFixed(2)} ZEC (Sapling=${(saplingPool / 1e8).toFixed(2)}, Orchard=${(orchardPool / 1e8).toFixed(2)})`);

    return {
      shieldedPoolSize,
      sproutPool,
      saplingPool,
      orchardPool,
      transparentPool,
      chainSupply,
      latestBlock
    };

  } catch (err) {
    console.error('❌ Error updating pool sizes from Zebra:', err.message);
    return null;
  }
}

/**
 * Update all-time transaction counts in privacy_stats table
 * This keeps shielded_tx, transparent_tx, fully_shielded_tx, etc. up-to-date
 */
async function updateTransactionCounts() {
  try {
    console.log('📈 Updating transaction counts...');

    // Get all-time transaction counts from the database
    const txCountsResult = await db.query(`
      SELECT
        COUNT(*) as total_transactions,
        COUNT(*) FILTER (WHERE is_coinbase) as coinbase_count,
        COUNT(*) FILTER (WHERE has_sapling OR has_orchard) as shielded_count,
        COUNT(*) FILTER (WHERE NOT is_coinbase AND NOT has_sapling AND NOT has_orchard) as transparent_count,
        MAX(block_height) as latest_block
      FROM transactions
      WHERE block_height > 0
    `);

    const txCounts = txCountsResult.rows[0];
    const totalTx = parseInt(txCounts.total_transactions) || 0;
    const coinbaseTx = parseInt(txCounts.coinbase_count) || 0;
    const shieldedTx = parseInt(txCounts.shielded_count) || 0;
    const transparentTx = parseInt(txCounts.transparent_count) || 0;
    const latestBlock = parseInt(txCounts.latest_block) || 0;

    // Get mixed vs fully shielded breakdown
    const shieldedTypesResult = await db.query(`
      SELECT
        COUNT(*) FILTER (
          WHERE (has_sapling OR has_orchard)
          AND vin_count > 0
          AND vout_count > 0
        ) as mixed_count,
        COUNT(*) FILTER (
          WHERE (has_sapling OR has_orchard)
          AND vin_count = 0
          AND vout_count = 0
        ) as fully_shielded_count
      FROM transactions
      WHERE block_height > 0
        AND (has_sapling OR has_orchard)
        AND NOT is_coinbase
    `);

    const shieldedTypes = shieldedTypesResult.rows[0];
    const mixedTx = parseInt(shieldedTypes.mixed_count) || 0;
    const fullyShieldedTx = parseInt(shieldedTypes.fully_shielded_count) || 0;

    // Get block count
    const blockCountResult = await db.query('SELECT COUNT(*) as total_blocks FROM blocks');
    const totalBlocks = parseInt(blockCountResult.rows[0].total_blocks) || 0;

    // Calculate shielded percentage
    const shieldedPercentage = totalTx > 0 ? (shieldedTx / totalTx) * 100 : 0;

    // Calculate average shielded per day (last 30 days)
    const avgPerDayResult = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE has_sapling OR has_orchard) / 30.0 as avg_shielded_per_day
      FROM transactions
      WHERE block_height > 0
        AND block_time >= EXTRACT(EPOCH FROM NOW() - INTERVAL '30 days')
    `);
    const avgShieldedPerDay = parseFloat(avgPerDayResult.rows[0]?.avg_shielded_per_day) || 0;

    // Determine adoption trend (compare last 7 days vs previous 7 days)
    const trendResult = await db.query(`
      SELECT
        COUNT(*) FILTER (
          WHERE (has_sapling OR has_orchard)
          AND block_time >= EXTRACT(EPOCH FROM NOW() - INTERVAL '7 days')
        ) as recent_shielded,
        COUNT(*) FILTER (
          WHERE (has_sapling OR has_orchard)
          AND block_time >= EXTRACT(EPOCH FROM NOW() - INTERVAL '14 days')
          AND block_time < EXTRACT(EPOCH FROM NOW() - INTERVAL '7 days')
        ) as previous_shielded
      FROM transactions
      WHERE block_height > 0
    `);

    const recentShielded = parseInt(trendResult.rows[0]?.recent_shielded) || 0;
    const previousShielded = parseInt(trendResult.rows[0]?.previous_shielded) || 0;

    let adoptionTrend = 'stable';
    if (previousShielded > 0) {
      const change = ((recentShielded - previousShielded) / previousShielded) * 100;
      if (change > 10) adoptionTrend = 'growing';
      else if (change < -10) adoptionTrend = 'declining';
    }

    // Update privacy_stats table
    const existingStats = await db.query('SELECT id FROM privacy_stats ORDER BY updated_at DESC LIMIT 1');

    if (existingStats.rows.length > 0) {
      await db.query(`
        UPDATE privacy_stats SET
          total_blocks = $1,
          total_transactions = $2,
          shielded_tx = $3,
          transparent_tx = $4,
          coinbase_tx = $5,
          mixed_tx = $6,
          fully_shielded_tx = $7,
          shielded_percentage = $8,
          avg_shielded_per_day = $9,
          adoption_trend = $10,
          last_block_scanned = $11,
          updated_at = NOW()
        WHERE id = $12
      `, [
        totalBlocks,
        totalTx,
        shieldedTx,
        transparentTx,
        coinbaseTx,
        mixedTx,
        fullyShieldedTx,
        shieldedPercentage,
        avgShieldedPerDay,
        adoptionTrend,
        latestBlock,
        existingStats.rows[0].id
      ]);
    }

    console.log(`   ✓ Tx counts: ${shieldedTx.toLocaleString()} shielded, ${transparentTx.toLocaleString()} transparent (${shieldedPercentage.toFixed(2)}%)`);
    console.log(`   ✓ Fully shielded: ${fullyShieldedTx.toLocaleString()}, Mixed: ${mixedTx.toLocaleString()}, Trend: ${adoptionTrend}`);

  } catch (err) {
    console.error('❌ Error updating transaction counts:', err.message);
  }
}

async function zebradRPC(method, params = []) {
  let auth = '';

  try {
    const cookie = fs.readFileSync(config.zebra.cookieFile, 'utf8').trim();
    auth = 'Basic ' + Buffer.from(cookie).toString('base64');
  } catch (err) {
    console.warn('⚠️  Could not read cookie, trying without auth:', err.message);
  }

  const headers = {
    'Content-Type': 'application/json',
  };

  if (auth) {
    headers['Authorization'] = auth;
  }

  const response = await fetch(config.zebra.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '1.0',
      id: 'indexer',
      method,
      params,
    }),
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(`Zebrad RPC error: ${data.error.message}`);
  }

  return data.result;
}

async function indexBlock(height) {
  const blockHash = await zebradRPC('getblockhash', [height]);
  const block = await zebradRPC('getblock', [blockHash, 1]);

  await db.query(`
    INSERT INTO blocks (
      height, hash, timestamp, version, merkle_root, final_sapling_root,
      bits, nonce, solution, difficulty, size, transaction_count,
      previous_block_hash, next_block_hash, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
    ON CONFLICT (height) DO UPDATE SET
      hash = EXCLUDED.hash,
      timestamp = EXCLUDED.timestamp,
      transaction_count = EXCLUDED.transaction_count,
      next_block_hash = EXCLUDED.next_block_hash
  `, [
    height,
    block.hash,
    block.time,
    block.version,
    block.merkleroot,
    block.finalsaplingroot,
    block.bits,
    block.nonce,
    block.solution,
    block.difficulty,
    block.size,
    block.tx ? block.tx.length : 0,
    block.previousblockhash || null,
    block.nextblockhash || null,
  ]);

  if (block.tx && block.tx.length > 0) {
    // Process transactions in parallel batches
    const TX_BATCH_SIZE = 20; // Process more transactions in parallel
    for (let i = 0; i < block.tx.length; i += TX_BATCH_SIZE) {
      const txBatch = block.tx.slice(i, i + TX_BATCH_SIZE);
      await Promise.allSettled(txBatch.map((txid, idx) =>
        indexTransaction(txid, height, block.time, i + idx)
      ));
    }
  }

  // Redis after indexing
  await redis.setEx(`block:${height}`, 3600, JSON.stringify(block));
  await redis.setEx(`block:hash:${blockHash}`, 3600, JSON.stringify(block));
}

async function indexTransaction(txid, blockHeight, blockTime, txIndex) {
  try {
    // Use cache if available
    let tx = txCache.get(txid);
    if (!tx) {
      tx = await zebradRPC('getrawtransaction', [txid, 1]);
      cacheTx(txid, tx);
    }

    const hasSapling = (tx.vShieldedSpend?.length > 0 || tx.vShieldedOutput?.length > 0);
    const hasOrchard = (tx.orchard?.actions?.length > 0);
    const hasSprout = (tx.vJoinSplit?.length > 0);

    const shieldedSpends = tx.vShieldedSpend?.length || 0;
    const shieldedOutputs = tx.vShieldedOutput?.length || 0;
    const orchardActions = tx.orchard?.actions?.length || 0;

    // Calculate value balances (in zatoshis)
    const valueBalanceSapling = Math.round((tx.valueBalance || 0) * 100000000);
    const valueBalanceOrchard = tx.orchard?.valueBalanceZat || Math.round((tx.orchard?.valueBalance || 0) * 100000000);
    const totalValueBalance = valueBalanceSapling + valueBalanceOrchard;

    await db.query(`
      INSERT INTO transactions (
        txid, block_height, block_time, version, locktime, size,
        vin_count, vout_count, value_balance, value_balance_sapling, value_balance_orchard,
        has_sapling, has_orchard, has_sprout,
        shielded_spends, shielded_outputs, orchard_actions,
        tx_index, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
      ON CONFLICT (txid) DO NOTHING
    `, [
      txid,
      blockHeight,
      blockTime,
      tx.version,
      tx.locktime,
      tx.size,
      tx.vin ? tx.vin.length : 0,
      tx.vout ? tx.vout.length : 0,
      totalValueBalance, // Total (Sapling + Orchard)
      valueBalanceSapling, // Sapling only
      valueBalanceOrchard, // Orchard only
      hasSapling,
      hasOrchard,
      hasSprout,
      shieldedSpends,
      shieldedOutputs,
      orchardActions,
      txIndex,
    ]);

    // ========================================================================
    // SHIELDED FLOWS: Track shielding/deshielding for round-trip detection
    // ========================================================================
    // This feeds the linkability detection feature (Zooko's request)
    //
    // valueBalance semantics (from Zcash protocol):
    // - Positive valueBalance = ZEC LEAVING shielded pool → transparent (DESHIELD)
    // - Negative valueBalance = ZEC ENTERING shielded pool ← transparent (SHIELD)
    //
    // Think of it as: valueBalance = shielded_outputs - shielded_inputs
    // - If you're shielding: inputs > outputs → negative balance
    // - If you're deshielding: outputs > inputs → positive balance
    if (totalValueBalance !== 0) {
      const flowType = totalValueBalance > 0 ? 'deshield' : 'shield';
      const amountZat = Math.abs(totalValueBalance);

      // Determine which pool was used
      let poolType = 'sapling'; // default
      if (valueBalanceSapling !== 0 && valueBalanceOrchard !== 0) {
        poolType = 'mixed';
      } else if (valueBalanceOrchard !== 0) {
        poolType = 'orchard';
      } else if (valueBalanceSapling !== 0) {
        poolType = 'sapling';
      }

      // Calculate per-pool amounts (absolute values)
      const amountSaplingZat = flowType === 'shield'
        ? (valueBalanceSapling > 0 ? valueBalanceSapling : 0)
        : (valueBalanceSapling < 0 ? Math.abs(valueBalanceSapling) : 0);
      const amountOrchardZat = flowType === 'shield'
        ? (valueBalanceOrchard > 0 ? valueBalanceOrchard : 0)
        : (valueBalanceOrchard < 0 ? Math.abs(valueBalanceOrchard) : 0);

      // Extract transparent addresses involved in this flow
      // - For DESHIELD: addresses from vout (where the ZEC is going)
      // - For SHIELD: addresses from vin (where the ZEC came from)
      let transparentAddresses = [];
      let transparentValueZat = 0;

      if (flowType === 'deshield' && tx.vout) {
        // Deshield: ZEC going to transparent addresses via vout
        for (const vout of tx.vout) {
          if (vout.scriptPubKey && vout.scriptPubKey.addresses && vout.scriptPubKey.addresses.length > 0) {
            transparentAddresses.push(...vout.scriptPubKey.addresses);
            transparentValueZat += Math.round((vout.value || 0) * 100000000);
          }
        }
      } else if (flowType === 'shield' && tx.vin) {
        // Shield: ZEC coming from transparent addresses via vin
        // We already process vin below, so collect addresses here
        for (const vin of tx.vin) {
          if (vin.address) {
            transparentAddresses.push(vin.address);
          } else if (vin.prevout && vin.prevout.scriptPubKey && vin.prevout.scriptPubKey.addresses) {
            transparentAddresses.push(...vin.prevout.scriptPubKey.addresses);
          }
        }
      }

      // Deduplicate addresses
      transparentAddresses = [...new Set(transparentAddresses)];

      try {
        await db.query(`
          INSERT INTO shielded_flows (
            txid, block_height, block_time, flow_type, amount_zat,
            pool, amount_sapling_zat, amount_orchard_zat, transparent_addresses, transparent_value_zat
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (txid, flow_type) DO UPDATE SET
            transparent_addresses = EXCLUDED.transparent_addresses,
            transparent_value_zat = EXCLUDED.transparent_value_zat
        `, [
          txid,
          blockHeight,
          blockTime,
          flowType,
          amountZat,
          poolType,
          amountSaplingZat,
          amountOrchardZat,
          transparentAddresses.length > 0 ? transparentAddresses : null,
          transparentValueZat,
        ]);
      } catch (flowErr) {
        // Silently fail if shielded_flows table doesn't exist yet
        // (happens during initial setup before running create-table script)
        if (!flowErr.message.includes('relation "shielded_flows" does not exist')) {
          console.warn(`⚠️  Failed to insert shielded flow for ${txid}:`, flowErr.message);
        }
      }
    }

    // Index inputs (vin)
    if (tx.vin && tx.vin.length > 0) {
      for (let i = 0; i < tx.vin.length; i++) {
        const input = tx.vin[i];

        // Skip coinbase inputs
        if (input.coinbase) continue;

        // Try to get the address and value from the previous output
        let address = null;
        let value = null;

        try {
          if (input.txid && input.vout !== undefined) {
            // Check cache first
            let prevTx = txCache.get(input.txid);
            if (!prevTx) {
              prevTx = await zebradRPC('getrawtransaction', [input.txid, 1]);
              cacheTx(input.txid, prevTx);
            }

            const prevOut = prevTx.vout[input.vout];

            if (prevOut) {
              value = Math.round(prevOut.value * 100000000); // Convert to satoshis
              if (prevOut.scriptPubKey && prevOut.scriptPubKey.addresses) {
                address = prevOut.scriptPubKey.addresses[0];
              }
            }
          }
        } catch (err) {
          // Silently fail - input might reference a very old tx
        }

        await db.query(`
          INSERT INTO transaction_inputs (
            txid, vout_index, prev_txid, prev_vout,
            script_sig, sequence, address, value
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (txid, vout_index) DO NOTHING
        `, [
          txid,
          i,
          input.txid || null,
          input.vout !== undefined ? input.vout : null,
          input.scriptSig?.hex || null,
          input.sequence || null,
          address,
          value,
        ]);
      }
    }

    // Index outputs (vout)
    if (tx.vout && tx.vout.length > 0) {
      for (let i = 0; i < tx.vout.length; i++) {
        const output = tx.vout[i];
        const value = Math.round(output.value * 100000000); // Convert to satoshis
        let address = null;

        if (output.scriptPubKey && output.scriptPubKey.addresses) {
          address = output.scriptPubKey.addresses[0];
        }

        await db.query(`
          INSERT INTO transaction_outputs (
            txid, vout_index, value, script_pubkey, address, spent
          ) VALUES ($1, $2, $3, $4, $5, false)
          ON CONFLICT (txid, vout_index) DO NOTHING
        `, [
          txid,
          i,
          value,
          output.scriptPubKey?.hex || null,
          address,
        ]);

        // Update address stats for outputs (received)
        if (address) {
          await db.query(`
            INSERT INTO addresses (address, balance, total_received, tx_count, first_seen, last_seen, address_type)
            VALUES ($1, $2, $2, 1, $3, $3, 'transparent')
            ON CONFLICT (address) DO UPDATE SET
              balance = addresses.balance + EXCLUDED.total_received,
              total_received = addresses.total_received + EXCLUDED.total_received,
              tx_count = addresses.tx_count + 1,
              last_seen = EXCLUDED.last_seen,
              updated_at = NOW()
          `, [address, value, blockTime]);
        }
      }
    }

    // Update address stats for inputs (sent)
    if (tx.vin && tx.vin.length > 0) {
      for (let i = 0; i < tx.vin.length; i++) {
        const input = tx.vin[i];
        if (input.coinbase) continue;

        // Get the address from transaction_inputs we just inserted
        const inputResult = await db.query(
          'SELECT address, value FROM transaction_inputs WHERE txid = $1 AND vout_index = $2',
          [txid, i]
        );

        if (inputResult.rows.length > 0 && inputResult.rows[0].address) {
          const address = inputResult.rows[0].address;
          const value = inputResult.rows[0].value || 0;

          await db.query(`
            UPDATE addresses SET
              balance = balance - $2,
              total_sent = total_sent + $2,
              tx_count = tx_count + 1,
              last_seen = $3,
              updated_at = NOW()
            WHERE address = $1
          `, [address, value, blockTime]);
        }
      }
    }

  } catch (err) {
    console.warn(`⚠️  Failed to index tx ${txid}:`, err.message);
  }
}

async function syncToTip() {
  console.log('🔄 Starting sync to chain tip...\n');

  const chainHeight = await zebradRPC('getblockcount');
  console.log(`Chain height: ${chainHeight}`);

  const result = await db.query('SELECT MAX(height) as max_height FROM blocks');
  const lastHeight = parseInt(result.rows[0].max_height) || 0;
  console.log(`Last indexed: ${lastHeight}`);
  console.log(`Blocks to sync: ${chainHeight - lastHeight}\n`);

  // Process blocks in parallel batches
  const BATCH_SIZE = 30; // Process 30 blocks in parallel (conservative for server resources)
  const startTime = Date.now();

  for (let height = lastHeight + 1; height <= chainHeight; height += BATCH_SIZE) {
    const batchEnd = Math.min(height + BATCH_SIZE - 1, chainHeight);
    const batchPromises = [];

    for (let h = height; h <= batchEnd; h++) {
      batchPromises.push(indexBlock(h));
    }

    await Promise.all(batchPromises);

    const progress = ((batchEnd / chainHeight) * 100).toFixed(2);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const blocksPerSec = ((batchEnd - lastHeight) / (Date.now() - startTime) * 1000).toFixed(2);
    const remaining = chainHeight - batchEnd;
    const eta = (remaining / blocksPerSec).toFixed(0);

    console.log(`📊 Progress: ${progress}% (${batchEnd}/${chainHeight}) | ${blocksPerSec} blocks/sec | ETA: ${eta}s`);
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n✅ Sync complete in ${totalTime}s!\n`);
}

async function initializePrivacyTrends() {
  console.log('🔍 Initializing privacy trends (last 30 days)...');

  try {
    // Check how many days we have
    const countResult = await db.query('SELECT COUNT(*) as count FROM privacy_trends_daily');
    const existingDays = parseInt(countResult.rows[0].count);

    if (existingDays >= 30) {
      console.log(`✅ Privacy trends already initialized (${existingDays} days)`);
      return;
    }

    console.log(`📊 Found ${existingDays} days, populating missing data...`);

    const latestBlockResult = await db.query('SELECT MAX(height) as max_height FROM blocks');
    const latestBlock = parseInt(latestBlockResult.rows[0].max_height);
    const blocksPerDay = 1152;

    // Populate last 30 days
    for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
      const endBlock = latestBlock - (dayOffset * blocksPerDay);
      const startBlock = endBlock - blocksPerDay;

      // Get the date for this range
      const blockTimestampResult = await db.query(
        'SELECT timestamp FROM blocks WHERE height = $1',
        [endBlock]
      );

      if (blockTimestampResult.rows.length === 0) continue;

      const timestamp = parseInt(blockTimestampResult.rows[0].timestamp);
      const date = new Date(timestamp * 1000).toISOString().split('T')[0];

      // Check if this date already exists
      const existingResult = await db.query(
        'SELECT id FROM privacy_trends_daily WHERE date = $1',
        [date]
      );

      if (existingResult.rows.length > 0) continue;

      // Calculate stats for this day
      const statsResult = await db.query(`
        SELECT
          COUNT(*) FILTER (WHERE has_sapling OR has_orchard) as shielded_count,
          COUNT(*) FILTER (WHERE NOT is_coinbase AND NOT has_sapling AND NOT has_orchard) as transparent_count
        FROM transactions
        WHERE block_height >= $1 AND block_height <= $2
      `, [startBlock, endBlock]);

      const stats = statsResult.rows[0];
      const shieldedCount = parseInt(stats.shielded_count || 0);
      const transparentCount = parseInt(stats.transparent_count || 0);
      const totalCount = shieldedCount + transparentCount;
      const shieldedPercentage = totalCount > 0 ? (shieldedCount / totalCount) * 100 : 0;

      // Get current pool size and other stats from privacy_stats
      const privacyStatsResult = await db.query(`
        SELECT
          shielded_pool_size,
          chain_supply,
          shielded_tx,
          fully_shielded_tx,
          shielded_percentage as all_time_shielded_percent
        FROM privacy_stats
        ORDER BY updated_at DESC
        LIMIT 1
      `);
      const privacyStats = privacyStatsResult.rows[0] || {};
      const poolSize = parseInt(privacyStats.shielded_pool_size || 0);
      const chainSupply = parseInt(privacyStats.chain_supply || 0);
      const allTimeShieldedTx = parseInt(privacyStats.shielded_tx || 0);
      const fullyShieldedTx = parseInt(privacyStats.fully_shielded_tx || 0);
      const allTimeShieldedPercent = parseFloat(privacyStats.all_time_shielded_percent || 0);

      // Calculate privacy score for this day
      const privacyScore = calculatePrivacyScore({
        dailyShieldedPercent: shieldedPercentage,
        allTimeShieldedPercent: allTimeShieldedPercent,
        totalShieldedZat: poolSize,
        chainSupplyZat: chainSupply,
        fullyShieldedTx: fullyShieldedTx,
        shieldedTx: allTimeShieldedTx,
      });

      await db.query(`
        INSERT INTO privacy_trends_daily (date, shielded_count, transparent_count, shielded_percentage, pool_size, privacy_score, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [date, shieldedCount, transparentCount, shieldedPercentage, poolSize, privacyScore]);

      console.log(`  ✅ ${date}: ${shieldedPercentage.toFixed(2)}% shielded`);
    }

    console.log('✅ Privacy trends initialization complete!\n');
  } catch (err) {
    console.error('❌ Error initializing privacy trends:', err.message);
  }
}

async function updatePrivacyTrendsDaily() {
  try {
    console.log('📊 Updating privacy stats and trends...');

    // FIRST: Update pool sizes from Zebra RPC to get fresh data
    await updatePoolSizesFromZebra();

    // SECOND: Update all-time transaction counts in privacy_stats
    await updateTransactionCounts();

    // Get today's date
    const today = new Date().toISOString().split('T')[0];

    // Check if we already have data for today
    const existingResult = await db.query(
      'SELECT id FROM privacy_trends_daily WHERE date = $1',
      [today]
    );

    // Calculate stats for the last 24 hours (last ~1152 blocks)
    const latestBlockResult = await db.query('SELECT MAX(height) as max_height FROM blocks');
    const latestBlock = parseInt(latestBlockResult.rows[0].max_height);
    const blocksPerDay = 1152; // ~75 seconds per block
    const startBlock = latestBlock - blocksPerDay;

    const statsResult = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE has_sapling OR has_orchard) as shielded_count,
        COUNT(*) FILTER (WHERE NOT is_coinbase AND NOT has_sapling AND NOT has_orchard) as transparent_count
      FROM transactions
      WHERE block_height >= $1 AND block_height <= $2
    `, [startBlock, latestBlock]);

    const stats = statsResult.rows[0];
    const shieldedCount = parseInt(stats.shielded_count || 0);
    const transparentCount = parseInt(stats.transparent_count || 0);
    const totalCount = shieldedCount + transparentCount;
    const shieldedPercentage = totalCount > 0 ? (shieldedCount / totalCount) * 100 : 0;

    // Get current pool size and other stats from privacy_stats (now freshly updated!)
    const privacyStatsResult = await db.query(`
      SELECT
        shielded_pool_size,
        chain_supply,
        shielded_tx,
        fully_shielded_tx,
        shielded_percentage as all_time_shielded_percent
      FROM privacy_stats
      ORDER BY updated_at DESC
      LIMIT 1
    `);
    const privacyStats = privacyStatsResult.rows[0] || {};
    const poolSize = parseInt(privacyStats.shielded_pool_size || 0);
    const chainSupply = parseInt(privacyStats.chain_supply || 0);
    const allTimeShieldedTx = parseInt(privacyStats.shielded_tx || 0);
    const fullyShieldedTx = parseInt(privacyStats.fully_shielded_tx || 0);
    const allTimeShieldedPercent = parseFloat(privacyStats.all_time_shielded_percent || 0);

    // Calculate privacy score with new formula
    const privacyScore = calculatePrivacyScore({
      dailyShieldedPercent: shieldedPercentage,
      allTimeShieldedPercent: allTimeShieldedPercent,
      totalShieldedZat: poolSize,
      chainSupplyZat: chainSupply,
      fullyShieldedTx: fullyShieldedTx,
      shieldedTx: allTimeShieldedTx,
    });

    // Insert or update today's data
    if (existingResult.rows.length > 0) {
      await db.query(`
        UPDATE privacy_trends_daily SET
          shielded_count = $2,
          transparent_count = $3,
          shielded_percentage = $4,
          pool_size = $5,
          privacy_score = $6,
          created_at = NOW()
        WHERE date = $1
      `, [today, shieldedCount, transparentCount, shieldedPercentage, poolSize, privacyScore]);
      console.log(`✅ Updated privacy trends for ${today}: ${shieldedPercentage.toFixed(2)}% shielded (score: ${privacyScore})`);
    } else {
      await db.query(`
        INSERT INTO privacy_trends_daily (date, shielded_count, transparent_count, shielded_percentage, pool_size, privacy_score, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [today, shieldedCount, transparentCount, shieldedPercentage, poolSize, privacyScore]);
      console.log(`✅ Created privacy trends for ${today}: ${shieldedPercentage.toFixed(2)}% shielded (score: ${privacyScore})`);
    }

  } catch (err) {
    console.error('❌ Error updating privacy trends:', err.message);
  }
}

async function listenForBlocks() {
  console.log('👂 Listening for new blocks...\n');

  let lastHeight = await zebradRPC('getblockcount');
  let blocksIndexedToday = 0;

  // Initialize privacy trends (populate last 30 days if needed)
  await initializePrivacyTrends();

  // Update privacy trends for today
  await updatePrivacyTrendsDaily();

  setInterval(async () => {
    try {
      const currentHeight = await zebradRPC('getblockcount');

      if (currentHeight > lastHeight) {
        console.log(`\n🆕 New block detected: ${currentHeight}`);

        for (let height = lastHeight + 1; height <= currentHeight; height++) {
          await indexBlock(height);
          blocksIndexedToday++;

          // Update privacy trends every 100 blocks
          if (blocksIndexedToday % 100 === 0) {
            await updatePrivacyTrendsDaily();
          }
        }

        lastHeight = currentHeight;
      }
    } catch (err) {
      console.error('❌ Error checking for new blocks:', err.message);
    }
  }, 10000);

  // Also update privacy trends every hour
  setInterval(async () => {
    await updatePrivacyTrendsDaily();
  }, 3600000); // 1 hour
}

async function main() {
  console.log('🎯 Zcash Blockchain Indexer');
  console.log(`Network: ${config.network}`);
  console.log(`Zebra RPC: ${config.zebra.url}`);
  console.log(`Database: ${config.db.database}`);
  console.log('');

  try {
    await db.query('SELECT 1');
    console.log('✅ PostgreSQL connected');

    await redis.ping();
    console.log('✅ Redis connected');

    const blockCount = await zebradRPC('getblockcount');
    console.log(`✅ Zebrad connected (height: ${blockCount})`);
    console.log('');

    await syncToTip();
    await listenForBlocks();

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main().catch(console.error);
