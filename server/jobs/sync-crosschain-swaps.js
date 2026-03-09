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
 *   node sync-crosschain-swaps.js --heal       # match missing zec_txid from blockchain data
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
const ONECLICK_API_BASE = 'https://1click.chaindefuser.com/v0';
const API_KEY = process.env.NEAR_INTENTS_API_KEY;
const RATE_LIMIT_MS = 5500;
const MAX_MATCH_ATTEMPTS = 288; // 24h of 5-min retries

const isBackfill = process.argv.includes('--backfill');
const isSeed = process.argv.includes('--seed');
const isHeal = process.argv.includes('--heal');

// Populated on startup from the 1Click /v0/tokens endpoint
let TOKEN_MAP = {};

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
// Token map: assetId → { chain, token }
// Loaded once on startup from the 1Click /v0/tokens API (source of truth)
// ---------------------------------------------------------------------------

async function loadTokenMap() {
  try {
    log('Loading token map from 1Click API...');
    const res = await fetch(`${ONECLICK_API_BASE}/tokens`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const tokens = await res.json();

    const map = {};
    for (const t of tokens) {
      if (t.assetId && t.blockchain && t.symbol) {
        map[t.assetId] = {
          chain: t.blockchain === 'trx' ? 'tron' : t.blockchain === 'bnb' ? 'bsc' : t.blockchain,
          token: t.symbol.toUpperCase(),
        };
      }
    }

    log(`Loaded ${Object.keys(map).length} tokens into lookup map`);
    return map;
  } catch (e) {
    log(`⚠️ Failed to load token map: ${e.message} — falling back to chain-prefix parsing`);
    return {};
  }
}

function parseChainFromAsset(asset) {
  if (!asset) return { chain: 'unknown', token: 'UNKNOWN' };

  // 1. Exact lookup from the token map (authoritative)
  if (TOKEN_MAP[asset]) return TOKEN_MAP[asset];

  // 2. Fallback: extract chain prefix from nep141 format
  const a = asset.toLowerCase();
  if (a.includes('zec') || a.includes('zcash')) return { chain: 'zec', token: 'ZEC' };

  const m = asset.match(/nep141:([a-zA-Z]+)[\.\-]/);
  if (m && m[1]) {
    const raw = m[1].toLowerCase();
    const chain = raw === 'trx' ? 'tron' : raw === 'bnb' ? 'bsc' : raw;
    return { chain, token: `UNKNOWN_ON_${chain.toUpperCase()}` };
  }

  return { chain: 'other', token: 'OTHER' };
}

// ---------------------------------------------------------------------------
// Transform a NEAR Intents API tx object into a DB row
// ---------------------------------------------------------------------------

function transformSwap(tx, direction) {
  const fromParsed = parseChainFromAsset(tx.originAsset);
  const toParsed = parseChainFromAsset(tx.destinationAsset);

  const originHashes = tx.originChainTxHashes || [];
  const destHashes = tx.destinationChainTxHashes || [];
  const destIsZec = (tx.destinationAsset || '').toLowerCase().includes('zec');
  const originIsZec = (tx.originAsset || '').toLowerCase().includes('zec');

  let zecHashes, otherHashes;
  if (direction === 'inflow') {
    zecHashes = destHashes.length > 0 ? destHashes : (originIsZec ? originHashes : []);
    otherHashes = originHashes;
  } else {
    // For outflows: prefer originChainTxHashes, but for ZEC→ZEC swaps
    // the API often only populates destinationChainTxHashes
    zecHashes = originHashes.length > 0 ? originHashes : (destIsZec ? destHashes : []);
    otherHashes = destHashes;
  }

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
      matched = CASE WHEN cross_chain_swaps.matched THEN true ELSE EXCLUDED.matched END
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
// Extract the user's ZEC address from a matched transaction
// For inflows: find the output matching the expected ZEC amount (not the change output)
// For outflows: find the input address that isn't the bridge deposit address
// ---------------------------------------------------------------------------

async function extractZecAddress(txid, direction, expectedZecAmount) {
  try {
    if (direction === 'inflow' || direction === 'in') {
      if (expectedZecAmount && expectedZecAmount > 0) {
        const amountZat = Math.round(expectedZecAmount * 1e8);
        const tolerance = Math.max(Math.round(amountZat * 0.01), 100);
        const { rows } = await pool.query(
          `SELECT address FROM transaction_outputs
           WHERE txid = $1 AND address IS NOT NULL
             AND value BETWEEN $2 AND $3
           LIMIT 1`,
          [txid, amountZat - tolerance, amountZat + tolerance]
        );
        if (rows.length > 0) return rows[0].address;
      }
      const { rows } = await pool.query(
        `SELECT address, value FROM transaction_outputs
         WHERE txid = $1 AND address IS NOT NULL
         ORDER BY value ASC LIMIT 1`,
        [txid]
      );
      return rows.length > 0 ? rows[0].address : null;
    } else {
      const { rows } = await pool.query(
        `SELECT address FROM transaction_inputs
         WHERE txid = $1 AND address IS NOT NULL
         LIMIT 1`,
        [txid]
      );
      return rows.length > 0 ? rows[0].address : null;
    }
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Retry unmatched swaps
// ---------------------------------------------------------------------------

async function retryUnmatched() {
  const { rows } = await pool.query(`
    SELECT id, zec_txid, zec_address, direction, dest_amount, source_amount, dest_tx_hashes, source_tx_hashes
    FROM cross_chain_swaps
    WHERE matched = false AND zec_txid IS NOT NULL AND match_attempts < $1
  `, [MAX_MATCH_ATTEMPTS]);

  if (rows.length === 0) return 0;
  log(`Retrying ${rows.length} unmatched swaps...`);

  let matched = 0;
  for (const row of rows) {
    const exists = await checkTxExists(row.zec_txid);
    if (exists) {
      const expectedZec = row.direction === 'inflow'
        ? parseFloat(row.dest_amount)
        : parseFloat(row.source_amount);
      const zecAddr = await extractZecAddress(row.zec_txid, row.direction, expectedZec);

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
// Re-fetch swaps missing zec_txid from the API
// The API might have populated the tx hash field after our initial sync
// ---------------------------------------------------------------------------

async function refetchMissingTxids() {
  // Get breakdown of missing txids by direction
  const { rows: missingStats } = await pool.query(`
    SELECT direction, COUNT(*) as cnt
    FROM cross_chain_swaps
    WHERE zec_txid IS NULL AND status = 'SUCCESS'
    GROUP BY direction
  `);
  const missingByDir = {};
  for (const r of missingStats) missingByDir[r.direction] = parseInt(r.cnt);
  log(`Missing zec_txid totals: inflow=${missingByDir.inflow || 0}, outflow=${missingByDir.outflow || 0}`);

  const { rows } = await pool.query(`
    SELECT deposit_address, direction, source_chain, dest_chain, swap_created_at
    FROM cross_chain_swaps
    WHERE zec_txid IS NULL AND status = 'SUCCESS'
      AND swap_created_at >= NOW() - INTERVAL '30 days'
    ORDER BY swap_created_at DESC
    LIMIT 500
  `);

  if (rows.length === 0) {
    log('No recent swaps missing zec_txid (last 30 days)');
    return;
  }
  log(`Re-checking ${rows.length} recent swaps missing zec_txid...`);

  let filled = 0;
  let apiStillEmpty = 0;
  let notFoundInApi = 0;
  const depositSet = new Set(rows.map(r => r.deposit_address));
  const directionMap = new Map(rows.map(r => [r.deposit_address, r.direction]));
  const foundInApi = new Set();

  for (const direction of ['inflow', 'outflow']) {
    let page = 1;
    const maxPages = 20;

    while (page <= maxPages) {
      try {
        const data = await fetchSwapPage(direction, page, null);
        const txs = data.data || [];
        if (txs.length === 0) break;

        for (const tx of txs) {
          if (!depositSet.has(tx.depositAddress)) continue;
          foundInApi.add(tx.depositAddress);

          const dir = directionMap.get(tx.depositAddress);
          const zecField = dir === 'inflow' ? 'destinationChainTxHashes' : 'originChainTxHashes';
          const zecHashes = tx[zecField] || [];

          if (zecHashes.length > 0) {
            const zecTxid = zecHashes[0];
            const matched = await checkTxExists(zecTxid);
            await pool.query(
              'UPDATE cross_chain_swaps SET zec_txid = $1, matched = $2 WHERE deposit_address = $3 AND zec_txid IS NULL',
              [zecTxid, matched, tx.depositAddress]
            );
            filled++;
            log(`  FILLED: ${tx.depositAddress.slice(0, 12)}... → zec_txid=${zecTxid.slice(0, 12)}... (matched=${matched})`);
          } else {
            apiStillEmpty++;
          }
        }

        if (page >= (data.totalPages || 1)) break;
        page++;
        await delay(RATE_LIMIT_MS);
      } catch (e) {
        log(`  refetch error on ${direction} page ${page}: ${e.message}`);
        break;
      }
    }
  }

  notFoundInApi = rows.length - foundInApi.size;
  log(`Refetch summary: filled=${filled}, API still empty=${apiStillEmpty}, not found in API pages=${notFoundInApi}, total checked=${rows.length}`);
  if (apiStillEmpty > 0) {
    log(`  → ${apiStillEmpty} swaps exist in NEAR API but ${directionMap.size > 0 ? 'destinationChainTxHashes/originChainTxHashes' : 'tx hashes'} are still empty (NEAR API data gap)`);
  }
  if (notFoundInApi > 0) {
    log(`  → ${notFoundInApi} swaps not found in recent API pages (older than scan window)`);
  }
}

// ---------------------------------------------------------------------------
// Self-heal: find missing zec_txid from our own blockchain data
//
// Strategy 1: Direct address lookup (outflows with t1 deposit_address)
// Strategy 2: Amount + time matching (all remaining swaps)
//   - For outflows: find tx with output value ≈ source_amount within time window
//   - For inflows: find tx with output value ≈ dest_amount within time window
//   - Only accept unique matches (exactly 1 candidate) to avoid false positives
// ---------------------------------------------------------------------------

async function selfHealFromBlockchain() {
  log('Self-healing missing zec_txid from blockchain data...');

  let totalFixed = 0;

  // --- Strategy 1: Outflows with t1 deposit_address (direct lookup) ---
  const { rows: outflowsDirect } = await pool.query(`
    SELECT id, deposit_address, source_amount
    FROM cross_chain_swaps
    WHERE zec_txid IS NULL AND status = 'SUCCESS' AND direction = 'outflow'
      AND deposit_address LIKE 't1%'
  `);

  let directFixed = 0;
  for (const row of outflowsDirect) {
    const { rows: txRows } = await pool.query(`
      SELECT DISTINCT o.txid
      FROM transaction_outputs o
      JOIN transactions t ON t.txid = o.txid
      WHERE o.address = $1
      ORDER BY t.block_time DESC
      LIMIT 1
    `, [row.deposit_address]);

    if (txRows.length > 0) {
      const zecAddr = await extractZecAddress(txRows[0].txid, 'outflow', parseFloat(row.source_amount));
      await pool.query(
        'UPDATE cross_chain_swaps SET zec_txid = $1, matched = true, zec_address = COALESCE($3, zec_address) WHERE id = $2',
        [txRows[0].txid, row.id, zecAddr]
      );
      directFixed++;
    }
  }
  log(`  Strategy 1 (direct address): checked ${outflowsDirect.length}, fixed ${directFixed}`);
  totalFixed += directFixed;

  // --- Strategy 2: Amount + time matching for ALL remaining missing swaps ---
  // Process in batches to avoid memory issues
  const BATCH_SIZE = 500;
  let offset = 0;
  let amountFixed = 0;
  let ambiguous = 0;
  let noMatch = 0;

  while (true) {
    const { rows: batch } = await pool.query(`
      SELECT id, direction, source_amount, dest_amount, swap_created_at
      FROM cross_chain_swaps
      WHERE zec_txid IS NULL AND status = 'SUCCESS'
      ORDER BY swap_created_at DESC
      LIMIT $1 OFFSET $2
    `, [BATCH_SIZE, offset]);

    if (batch.length === 0) break;

    for (const row of batch) {
      // For outflows: user sent source_amount ZEC
      // For inflows: user received dest_amount ZEC
      const zecAmount = row.direction === 'outflow'
        ? parseFloat(row.source_amount)
        : parseFloat(row.dest_amount);

      if (!zecAmount || zecAmount <= 0) { noMatch++; continue; }

      const amountZat = Math.round(zecAmount * 1e8);
      // Tight tolerance: 0.5% to minimize false positives
      const tolerance = Math.max(Math.round(amountZat * 0.005), 1);

      const swapTime = new Date(row.swap_created_at);
      // For outflows: ZEC tx happens around or slightly before swap_created_at
      // For inflows: ZEC tx happens after swap_created_at (bridge processing)
      const windowStart = Math.floor((swapTime.getTime() - 4 * 3600 * 1000) / 1000);
      const windowEnd = Math.floor((swapTime.getTime() + 48 * 3600 * 1000) / 1000);

      // Find transactions with an output matching this exact amount in the time window
      const { rows: candidates } = await pool.query(`
        SELECT DISTINCT o.txid
        FROM transaction_outputs o
        JOIN transactions t ON t.txid = o.txid
        WHERE o.value BETWEEN $1 AND $2
          AND t.block_time >= $3 AND t.block_time <= $4
          AND t.is_coinbase = false
        LIMIT 2
      `, [amountZat - tolerance, amountZat + tolerance, windowStart, windowEnd]);

      if (candidates.length === 1) {
        const zecAddr = await extractZecAddress(candidates[0].txid, row.direction, zecAmount);
        await pool.query(
          'UPDATE cross_chain_swaps SET zec_txid = $1, matched = true, zec_address = COALESCE($3, zec_address) WHERE id = $2',
          [candidates[0].txid, row.id, zecAddr]
        );
        amountFixed++;
      } else if (candidates.length > 1) {
        ambiguous++;
      } else {
        noMatch++;
      }
    }

    offset += BATCH_SIZE;
    log(`  Strategy 2 progress: processed ${offset} swaps (fixed=${amountFixed}, ambiguous=${ambiguous}, no_match=${noMatch})`);
  }

  log(`  Strategy 2 (amount+time): fixed ${amountFixed}, ambiguous ${ambiguous}, no match ${noMatch}`);
  totalFixed += amountFixed;

  log(`Self-heal complete: ${totalFixed} total fixed from blockchain data`);
  return totalFixed;
}

// ---------------------------------------------------------------------------
// Fetch and store swaps (one direction at a time)
// ---------------------------------------------------------------------------

async function syncDirection(direction, startTs) {
  let page = 1;
  let total = 0;
  let hasMore = true;
  let missingZecTxid = 0;
  let hasZecTxid = 0;

  while (hasMore) {
    const data = await fetchSwapPage(direction, page, startTs);
    const txs = data.data || [];

    if (txs.length === 0) break;

    for (const tx of txs) {
      const row = transformSwap(tx, direction);
      if (row.zec_txid) hasZecTxid++;
      else missingZecTxid++;
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

  log(`  ${direction}: ${total} synced (${hasZecTxid} with zec_txid, ${missingZecTxid} missing — ${total > 0 ? ((missingZecTxid/total)*100).toFixed(1) : 0}% gap from NEAR API)`);
  return total;
}

// ---------------------------------------------------------------------------
// Backfill zec_address for matched swaps that are missing it
// ---------------------------------------------------------------------------

async function backfillZecAddresses() {
  const { rows } = await pool.query(`
    SELECT id, zec_txid, direction, dest_amount, source_amount
    FROM cross_chain_swaps
    WHERE zec_txid IS NOT NULL AND zec_address IS NULL AND matched = true
    LIMIT 2000
  `);

  if (rows.length === 0) return 0;
  log(`Backfilling zec_address for ${rows.length} matched swaps...`);

  let fixed = 0;
  for (const row of rows) {
    const expectedZec = row.direction === 'inflow'
      ? parseFloat(row.dest_amount)
      : parseFloat(row.source_amount);
    const addr = await extractZecAddress(row.zec_txid, row.direction, expectedZec);
    if (addr) {
      await pool.query('UPDATE cross_chain_swaps SET zec_address = $1 WHERE id = $2', [addr, row.id]);
      fixed++;
    }
  }
  log(`  Backfilled zec_address for ${fixed}/${rows.length} swaps`);
  return fixed;
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

  // Load token map from 1Click API (assetId → { chain, token })
  TOKEN_MAP = await loadTokenMap();

  // Seed mode: insert test fixtures
  if (isSeed) {
    await seedTestData();
    await pool.end();
    return;
  }

  // Heal mode: only run blockchain-based self-healing
  if (isHeal) {
    log('HEAL MODE: matching missing zec_txid from blockchain data');
    await selfHealFromBlockchain();
    await retryUnmatched();
    await backfillZecAddresses();
    await updateAmountStats();
    await pool.end();
    log('=== Heal complete ===');
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

  // Self-heal: find missing zec_txid from our own blockchain data
  await selfHealFromBlockchain();

  // Backfill zec_address for matched swaps missing it
  await backfillZecAddresses();

  // Re-fetch swaps missing zec_txid (API may have filled them in)
  if (!isBackfill) {
    await refetchMissingTxids();
  }

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
