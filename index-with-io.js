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
  console.log(`📦 Indexing block ${height}...`);

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
    for (let i = 0; i < block.tx.length; i++) {
      await indexTransaction(block.tx[i], height, block.time, i);
    }
  }

  await redis.setEx(`block:${height}`, 3600, JSON.stringify(block));
  await redis.setEx(`block:hash:${blockHash}`, 3600, JSON.stringify(block));

  console.log(`✅ Block ${height} indexed (${block.tx ? block.tx.length : 0} txs)`);
}

async function indexTransaction(txid, blockHeight, blockTime, txIndex) {
  try {
    const tx = await zebradRPC('getrawtransaction', [txid, 1]);

    const hasSapling = (tx.vShieldedSpend?.length > 0 || tx.vShieldedOutput?.length > 0);
    const hasOrchard = (tx.orchard?.actions?.length > 0);
    const hasSprout = (tx.vJoinSplit?.length > 0);

    const shieldedSpends = tx.vShieldedSpend?.length || 0;
    const shieldedOutputs = tx.vShieldedOutput?.length || 0;
    const orchardActions = tx.orchard?.actions?.length || 0;

    await db.query(`
      INSERT INTO transactions (
        txid, block_height, block_time, version, locktime, size,
        vin_count, vout_count, value_balance,
        has_sapling, has_orchard, has_sprout,
        shielded_spends, shielded_outputs, orchard_actions,
        tx_index, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
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
      tx.valueBalance || 0,
      hasSapling,
      hasOrchard,
      hasSprout,
      shieldedSpends,
      shieldedOutputs,
      orchardActions,
      txIndex,
    ]);

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
            const prevTx = await zebradRPC('getrawtransaction', [input.txid, 1]);
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
          ON CONFLICT DO NOTHING
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
          ON CONFLICT DO NOTHING
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

  for (let height = lastHeight + 1; height <= chainHeight; height++) {
    await indexBlock(height);

    if (height % 100 === 0) {
      const progress = ((height / chainHeight) * 100).toFixed(2);
      console.log(`📊 Progress: ${progress}% (${height}/${chainHeight})`);
    }
  }

  console.log('\n✅ Sync complete!\n');
}

async function listenForBlocks() {
  console.log('👂 Listening for new blocks...\n');

  let lastHeight = await zebradRPC('getblockcount');

  setInterval(async () => {
    try {
      const currentHeight = await zebradRPC('getblockcount');

      if (currentHeight > lastHeight) {
        console.log(`\n🆕 New block detected: ${currentHeight}`);

        for (let height = lastHeight + 1; height <= currentHeight; height++) {
          await indexBlock(height);
        }

        lastHeight = currentHeight;
      }
    } catch (err) {
      console.error('❌ Error checking for new blocks:', err.message);
    }
  }, 10000);
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
