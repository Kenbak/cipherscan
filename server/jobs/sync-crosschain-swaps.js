#!/usr/bin/env node
/**
 * Sync Cross-Chain Swaps from NEAR Intents
 *
 * Fetches ZEC swap data from the NEAR Intents Explorer API and stores it
 * in PostgreSQL for historical charts, TX linking, and privacy recommendations.
 *
 * Modes:
 *   node sync-crosschain-swaps.js              # incremental sync (cron)
 *   node sync-crosschain-swaps.js --backfill   # full historical backfill
 *   node sync-crosschain-swaps.js --seed       # insert test fixtures (local dev)
 *
 * Cron (every 5 min):
 *   star/5 * * * * cd /root/cipherscan/server/jobs && node sync-crosschain-swaps.js >> /var/log/crosschain-sync.log 2>&1
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, '../api/.env') });

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 3,
  idleTimeoutMillis: 30000,
});

const NEAR_API_BASE = 'https://explorer.near-intents.org/api/v0';
const API_KEY = process.env.NEAR_INTENTS_API_KEY;
const RATE_LIMIT_MS = 5500;
const MAX_MATCH_ATTEMPTS = 288; // 24h of 5-min retries

const isBackfill = process.argv.includes('--backfill');
const isSeed = process.argv.includes('--seed');

function log(msg) {
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
  console.log(`[${ts}] ${msg}`);
}

const delay = (ms) => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// NEAR Intents API helpers
// ---------------------------------------------------------------------------

async function nearRequest(endpoint, params = {}) {
  if (!API_KEY) throw new Error('NEAR_INTENTS_API_KEY not set');

  const url = new URL(`${NEAR_API_BASE}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${API_KEY}`, Accept: 'application/json' },
  });

  if (res.status === 429) {
    log('Rate limited, waiting 10s...');
    await delay(10000);
    return nearRequest(endpoint, params);
  }
  if (!res.ok) throw new Error(`NEAR API ${res.status}: ${res.statusText}`);
  return res.json();
}

async function fetchSwapPage(direction, page, startTs) {
  const params = {
    statuses: 'SUCCESS',
    perPage: 100,
    page,
  };
  if (direction === 'inflow') params.toChainId = 'zec';
  else params.fromChainId = 'zec';
  if (startTs) params.startTimestamp = startTs;

  return nearRequest('/transactions-pages', params);
}

// ---------------------------------------------------------------------------
// Chain parsing (reused from near-intents.js)
// ---------------------------------------------------------------------------

function parseChainFromAsset(asset) {
  if (!asset) return { chain: 'unknown', token: 'UNKNOWN' };
  const a = asset.toLowerCase();
  if (a.includes('zec') || a.includes('zcash')) return { chain: 'zec', token: 'ZEC' };

  const knownTokens = {
    '0xdac17f958d2ee523a2206206994597c13d831ec7': { token: 'USDT', chain: 'eth' },
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { token: 'USDC', chain: 'eth' },
  };
  for (const [addr, info] of Object.entries(knownTokens)) {
    if (a.includes(addr)) return info;
  }
  if (a.includes('usdt.tether-token.near')) return { chain: 'near', token: 'USDT' };
  if (a.includes('usdc')) {
    if (a.includes('sol-')) return { chain: 'sol', token: 'USDC' };
    if (a.includes('eth-')) return { chain: 'eth', token: 'USDC' };
    if (a.includes('base-')) return { chain: 'base', token: 'USDC' };
    if (a.includes('arb-')) return { chain: 'arb', token: 'USDC' };
    return { chain: 'near', token: 'USDC' };
  }

  const prefixes = ['eth', 'btc', 'sol', 'near', 'doge', 'xrp', 'base', 'arb', 'pol', 'bsc', 'avax', 'tron', 'trx', 'bnb', 'op', 'ftm', 'sui', 'apt'];
  for (const p of prefixes) {
    const re = new RegExp(`nep141:${p}[\\.\\-]`);
    if (re.test(a) && !a.includes('0x')) {
      const chain = p === 'trx' ? 'tron' : p === 'bnb' ? 'bsc' : p;
      return { chain, token: chain.toUpperCase() };
    }
  }

  const m = asset.match(/nep141:([a-zA-Z]+)-/);
  if (m && m[1] && m[1].length >= 2 && m[1].length <= 6) {
    const chain = m[1].toLowerCase();
    return { chain: chain === 'trx' ? 'tron' : chain === 'bnb' ? 'bsc' : chain, token: chain.toUpperCase() };
  }
  return { chain: 'other', token: 'OTHER' };
}

// ---------------------------------------------------------------------------
// Transform a NEAR Intents API tx object into a DB row
// ---------------------------------------------------------------------------

function transformSwap(tx, direction) {
  const fromParsed = parseChainFromAsset(tx.originAsset);
  const toParsed = parseChainFromAsset(tx.destinationAsset);

  const zecHashes = direction === 'inflow'
    ? (tx.destinationChainTxHashes || [])
    : (tx.originChainTxHashes || []);

  const otherHashes = direction === 'inflow'
    ? (tx.originChainTxHashes || [])
    : (tx.destinationChainTxHashes || []);

  const zecTxid = zecHashes.length > 0 ? zecHashes[0] : null;

  return {
    deposit_address: tx.depositAddress,
    direction,
    status: tx.status || 'SUCCESS',
    source_chain: direction === 'inflow' ? fromParsed.chain : 'zec',
    source_token: direction === 'inflow' ? fromParsed.token : 'ZEC',
    source_amount: parseFloat(tx.amountInFormatted) || 0,
    source_amount_usd: parseFloat(tx.amountInUsd) || 0,
    source_tx_hashes: direction === 'inflow' ? otherHashes : zecHashes,
    dest_chain: direction === 'inflow' ? 'zec' : toParsed.chain,
    dest_token: direction === 'inflow' ? 'ZEC' : toParsed.token,
    dest_amount: parseFloat(tx.amountOutFormatted) || 0,
    dest_amount_usd: parseFloat(tx.amountOutUsd) || 0,
    dest_tx_hashes: direction === 'inflow' ? zecHashes : otherHashes,
    zec_txid: zecTxid,
    zec_address: null, // populated during matching
    near_tx_hashes: tx.nearTxHashes || [],
    senders: tx.senders || [],
    recipient: tx.recipient || null,
    swap_created_at: tx.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Upsert swap into DB
// ---------------------------------------------------------------------------

async function upsertSwap(row) {
  const q = `
    INSERT INTO cross_chain_swaps (
      deposit_address, direction, status,
      source_chain, source_token, source_amount, source_amount_usd, source_tx_hashes,
      dest_chain, dest_token, dest_amount, dest_amount_usd, dest_tx_hashes,
      zec_txid, zec_address, near_tx_hashes, senders, recipient,
      matched, match_attempts, swap_created_at
    ) VALUES (
      $1, $2, $3,
      $4, $5, $6, $7, $8,
      $9, $10, $11, $12, $13,
      $14, $15, $16, $17, $18,
      $19, 0, $20
    )
    ON CONFLICT (deposit_address) DO UPDATE SET
      status = EXCLUDED.status,
      source_tx_hashes = EXCLUDED.source_tx_hashes,
      dest_tx_hashes = EXCLUDED.dest_tx_hashes,
      zec_txid = COALESCE(EXCLUDED.zec_txid, cross_chain_swaps.zec_txid),
      near_tx_hashes = EXCLUDED.near_tx_hashes,
      matched = EXCLUDED.matched
    RETURNING id
  `;

  const matched = row.zec_txid ? await checkTxExists(row.zec_txid) : false;

  const values = [
    row.deposit_address, row.direction, row.status,
    row.source_chain, row.source_token, row.source_amount, row.source_amount_usd, row.source_tx_hashes,
    row.dest_chain, row.dest_token, row.dest_amount, row.dest_amount_usd, row.dest_tx_hashes,
    row.zec_txid, row.zec_address, row.near_tx_hashes, row.senders, row.recipient,
    matched, row.swap_created_at,
  ];

  return pool.query(q, values);
}

async function checkTxExists(txid) {
  const r = await pool.query('SELECT 1 FROM transactions WHERE txid = $1 LIMIT 1', [txid]);
  return r.rows.length > 0;
}

// ---------------------------------------------------------------------------
// Retry unmatched swaps
// ---------------------------------------------------------------------------

async function retryUnmatched() {
  const { rows } = await pool.query(`
    SELECT id, zec_txid, zec_address, direction, dest_tx_hashes, source_tx_hashes
    FROM cross_chain_swaps
    WHERE matched = false AND zec_txid IS NOT NULL AND match_attempts < $1
  `, [MAX_MATCH_ATTEMPTS]);

  if (rows.length === 0) return 0;
  log(`Retrying ${rows.length} unmatched swaps...`);

  let matched = 0;
  for (const row of rows) {
    const exists = await checkTxExists(row.zec_txid);
    if (exists) {
      // Try to find the ZEC address from our DB
      let zecAddr = null;
      if (row.direction === 'inflow') {
        const addrResult = await pool.query(
          'SELECT address FROM transaction_outputs WHERE txid = $1 AND address IS NOT NULL LIMIT 1',
          [row.zec_txid]
        );
        if (addrResult.rows.length > 0) zecAddr = addrResult.rows[0].address;
      } else {
        const addrResult = await pool.query(
          'SELECT address FROM transaction_inputs WHERE txid = $1 AND address IS NOT NULL LIMIT 1',
          [row.zec_txid]
        );
        if (addrResult.rows.length > 0) zecAddr = addrResult.rows[0].address;
      }

      await pool.query(
        'UPDATE cross_chain_swaps SET matched = true, zec_address = COALESCE($2, zec_address), match_attempts = match_attempts + 1 WHERE id = $1',
        [row.id, zecAddr]
      );
      matched++;
    } else {
      await pool.query(
        'UPDATE cross_chain_swaps SET match_attempts = match_attempts + 1 WHERE id = $1',
        [row.id]
      );
    }
  }
  log(`Matched ${matched}/${rows.length} previously unmatched swaps`);
  return matched;
}

// ---------------------------------------------------------------------------
// Fetch and store swaps (one direction at a time)
// ---------------------------------------------------------------------------

async function syncDirection(direction, startTs) {
  let page = 1;
  let total = 0;
  let hasMore = true;

  while (hasMore) {
    const data = await fetchSwapPage(direction, page, startTs);
    const txs = data.data || [];

    if (txs.length === 0) break;

    for (const tx of txs) {
      const row = transformSwap(tx, direction);
      await upsertSwap(row);
      total++;
    }

    hasMore = page < (data.totalPages || 1);
    page++;

    if (hasMore) {
      log(`  ${direction} page ${page - 1}/${data.totalPages} (${total} swaps so far)`);
      await delay(RATE_LIMIT_MS);
    }
  }

  return total;
}

// ---------------------------------------------------------------------------
// Update daily amount stats (dynamic clustering on trailing 7d)
// ---------------------------------------------------------------------------

async function updateAmountStats() {
  const today = new Date().toISOString().slice(0, 10);

  // Get trailing 7d swaps grouped by chain/token
  const { rows } = await pool.query(`
    SELECT source_chain, source_token, source_amount, source_amount_usd
    FROM cross_chain_swaps
    WHERE status = 'SUCCESS'
      AND swap_created_at >= NOW() - INTERVAL '7 days'
      AND direction = 'inflow'
    ORDER BY source_chain, source_token, source_amount
  `);

  if (rows.length === 0) return;

  // Group by chain+token
  const groups = {};
  for (const r of rows) {
    const key = `${r.source_chain}:${r.source_token}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push({ amount: parseFloat(r.source_amount), usd: parseFloat(r.source_amount_usd) || 0 });
  }

  // Clear today's stats and recompute
  await pool.query('DELETE FROM swap_amount_stats_daily WHERE date = $1', [today]);

  for (const [key, amounts] of Object.entries(groups)) {
    const [chain, token] = key.split(':');
    const clusters = clusterAmounts(amounts);

    for (const c of clusters) {
      await pool.query(`
        INSERT INTO swap_amount_stats_daily (date, source_chain, source_token, amount_bucket, swap_count, total_volume_usd)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (date, source_chain, source_token, amount_bucket) DO UPDATE SET
          swap_count = EXCLUDED.swap_count,
          total_volume_usd = EXCLUDED.total_volume_usd
      `, [today, chain, token, c.centroid, c.count, c.totalUsd]);
    }
  }

  log(`Updated amount stats for ${Object.keys(groups).length} chain/token pairs`);
}

/**
 * Density-based clustering: find natural groups where amounts fall within 5% of each other
 */
function clusterAmounts(amounts) {
  amounts = amounts.filter(a => a.amount > 0);
  if (amounts.length === 0) return [];

  amounts.sort((a, b) => a.amount - b.amount);
  const clusters = [];
  let current = { amounts: [amounts[0]], totalUsd: amounts[0].usd };

  for (let i = 1; i < amounts.length; i++) {
    const prev = current.amounts[current.amounts.length - 1];
    const pct = prev.amount > 0 ? Math.abs(amounts[i].amount - prev.amount) / prev.amount : 1;

    if (pct <= 0.05) {
      current.amounts.push(amounts[i]);
      current.totalUsd += amounts[i].usd;
    } else {
      clusters.push(current);
      current = { amounts: [amounts[i]], totalUsd: amounts[i].usd };
    }
  }
  clusters.push(current);

  // Only keep clusters with >= 3 swaps
  return clusters
    .filter(c => c.amounts.length >= 3)
    .map(c => {
      const rawCentroid = c.amounts.reduce((s, a) => s + a.amount, 0) / c.amounts.length;
      const avgUsd = c.totalUsd / c.amounts.length;
      const unitPrice = rawCentroid > 0 ? avgUsd / rawCentroid : 1;
      // Round so each step ≈ $1-$5
      const decimals = unitPrice >= 10000 ? 5 : unitPrice >= 1000 ? 4 : unitPrice >= 100 ? 3 : unitPrice >= 10 ? 2 : unitPrice >= 1 ? 1 : 0;
      return {
        centroid: parseFloat(rawCentroid.toFixed(decimals)),
        count: c.amounts.length,
        totalUsd: parseFloat(c.totalUsd.toFixed(2)),
      };
    })
    .filter(c => c.centroid > 0)
    .sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  log('=== Cross-Chain Swap Sync ===');

  if (!API_KEY && !isSeed) {
    log('NEAR_INTENTS_API_KEY not set, skipping');
    process.exit(0);
  }

  try {
    await pool.query('SELECT 1');
    log('DB connected');
  } catch (e) {
    log(`DB connection failed: ${e.message}`);
    process.exit(1);
  }

  // Seed mode: insert test fixtures
  if (isSeed) {
    await seedTestData();
    await pool.end();
    return;
  }

  // Get last sync timestamp
  const stateResult = await pool.query(
    "SELECT last_sync_timestamp FROM sync_state WHERE job_name = 'crosschain_swaps'"
  );
  let lastSync = stateResult.rows[0]?.last_sync_timestamp;

  if (isBackfill) {
    log('BACKFILL MODE: fetching all historical data');
    lastSync = null;
  } else if (lastSync) {
    log(`Incremental sync from ${lastSync}`);
  }

  const startTs = lastSync ? new Date(lastSync).toISOString() : undefined;

  // Fetch inflows
  log('Fetching inflows (other → ZEC)...');
  const inflowCount = await syncDirection('inflow', startTs);
  log(`  ${inflowCount} inflows synced`);

  await delay(RATE_LIMIT_MS);

  // Fetch outflows
  log('Fetching outflows (ZEC → other)...');
  const outflowCount = await syncDirection('outflow', startTs);
  log(`  ${outflowCount} outflows synced`);

  // Retry unmatched swaps
  await retryUnmatched();

  // Update amount stats
  await updateAmountStats();

  // Update sync state
  const totalSynced = inflowCount + outflowCount;
  await pool.query(`
    UPDATE sync_state SET
      last_sync_timestamp = NOW(),
      last_sync_count = $1,
      updated_at = NOW()
    WHERE job_name = 'crosschain_swaps'
  `, [totalSynced]);

  log(`=== Done. ${totalSynced} swaps synced ===`);
  await pool.end();
}

// ---------------------------------------------------------------------------
// Seed test data for local/testnet development
// ---------------------------------------------------------------------------

async function seedTestData() {
  log('Seeding test data...');

  const now = Date.now();
  const fixtures = [];

  const chains = ['eth', 'btc', 'sol', 'near'];
  const tokens = { eth: 'USDC', btc: 'BTC', sol: 'USDC', near: 'NEAR' };
  const amounts = [50, 100, 100, 100, 250, 250, 500, 75, 150, 200];

  for (let i = 0; i < 30; i++) {
    const chain = chains[i % chains.length];
    const direction = i % 3 === 0 ? 'outflow' : 'inflow';
    const amt = amounts[i % amounts.length] + (Math.random() * 5 - 2.5);
    const dayOffset = Math.floor(i / 3);

    fixtures.push({
      deposit_address: `seed_${i}_${Date.now()}`,
      direction,
      status: 'SUCCESS',
      source_chain: direction === 'inflow' ? chain : 'zec',
      source_token: direction === 'inflow' ? tokens[chain] : 'ZEC',
      source_amount: parseFloat(amt.toFixed(4)),
      source_amount_usd: parseFloat((amt * (chain === 'btc' ? 60000 : chain === 'eth' ? 3000 : 1)).toFixed(2)),
      source_tx_hashes: [`0xseed${i}source`],
      dest_chain: direction === 'inflow' ? 'zec' : chain,
      dest_token: direction === 'inflow' ? 'ZEC' : tokens[chain],
      dest_amount: parseFloat((amt * 0.995).toFixed(4)),
      dest_amount_usd: parseFloat((amt * 0.995 * (chain === 'btc' ? 60000 : chain === 'eth' ? 3000 : 1)).toFixed(2)),
      dest_tx_hashes: [`0xseed${i}dest`],
      zec_txid: null,
      zec_address: null,
      near_tx_hashes: [`seed${i}near`],
      senders: [`seed_sender_${i}`],
      recipient: `seed_recipient_${i}`,
      swap_created_at: new Date(now - dayOffset * 86400000 - Math.random() * 86400000).toISOString(),
    });
  }

  for (const f of fixtures) {
    await upsertSwap(f);
  }

  await updateAmountStats();
  log(`Seeded ${fixtures.length} test swaps`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
