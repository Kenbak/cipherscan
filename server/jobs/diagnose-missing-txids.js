#!/usr/bin/env node
/**
 * Diagnostic: fetch raw NEAR API data for swaps where we have zec_txid = NULL
 * and dump EVERY field to see if the API actually returns empty or we parse wrong.
 *
 * Usage: node diagnose-missing-txids.js
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
  max: 2,
});

const NEAR_API_BASE = 'https://explorer.near-intents.org/api/v0';
const API_KEY = process.env.NEAR_INTENTS_API_KEY;
const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function nearRequest(endpoint, params = {}) {
  const url = new URL(`${NEAR_API_BASE}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${API_KEY}`, Accept: 'application/json' },
  });
  if (res.status === 429) {
    console.log('Rate limited, waiting 10s...');
    await delay(10000);
    return nearRequest(endpoint, params);
  }
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

async function main() {
  console.log('=== RAW NEAR API CHECK: Do they actually return empty tx hashes? ===\n');

  // Quick stats
  const { rows: stats } = await pool.query(`
    SELECT direction,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE zec_txid IS NULL) as missing
    FROM cross_chain_swaps WHERE status = 'SUCCESS'
    GROUP BY direction
  `);
  for (const s of stats) {
    console.log(`${s.direction}: ${s.missing}/${s.total} missing zec_txid (${((s.missing/s.total)*100).toFixed(1)}%)`);
  }

  // Breakdown of missing outflows by dest_chain (ZEC→ZEC vs ZEC→other)
  console.log('\nMissing outflows by dest_chain:');
  const { rows: outBreak } = await pool.query(`
    SELECT dest_chain, dest_token, COUNT(*) as cnt
    FROM cross_chain_swaps
    WHERE zec_txid IS NULL AND direction = 'outflow' AND status = 'SUCCESS'
    GROUP BY dest_chain, dest_token ORDER BY cnt DESC LIMIT 10
  `);
  for (const r of outBreak) console.log(`  ${r.dest_chain}/${r.dest_token}: ${r.cnt}`);

  // How many missing outflows have t1 deposit addresses?
  console.log('\nMissing outflow deposit_address patterns:');
  const { rows: depPat } = await pool.query(`
    SELECT
      CASE WHEN deposit_address LIKE 't1%' THEN 't1_addr'
           WHEN deposit_address LIKE 't3%' THEN 't3_addr'
           ELSE 'hex_hash' END as type,
      COUNT(*) as cnt
    FROM cross_chain_swaps
    WHERE zec_txid IS NULL AND direction = 'outflow' AND status = 'SUCCESS'
    GROUP BY type ORDER BY cnt DESC
  `);
  for (const r of depPat) console.log(`  ${r.type}: ${r.cnt}`);

  // Missing inflows by recipient type
  console.log('\nMissing inflow recipient patterns:');
  const { rows: recPat } = await pool.query(`
    SELECT
      CASE WHEN recipient IS NULL THEN 'null'
           WHEN recipient LIKE 't1%' THEN 't1_addr'
           WHEN recipient LIKE 't3%' THEN 't3_addr'
           WHEN recipient LIKE 'u1%' THEN 'unified'
           WHEN recipient LIKE 'zs%' THEN 'sapling'
           WHEN recipient LIKE '0x%' THEN 'evm_addr'
           ELSE 'other_hash' END as type,
      COUNT(*) as cnt
    FROM cross_chain_swaps
    WHERE zec_txid IS NULL AND direction = 'inflow' AND status = 'SUCCESS'
    GROUP BY type ORDER BY cnt DESC
  `);
  for (const r of recPat) console.log(`  ${r.type}: ${r.cnt}`);

  // Pick 5 recent INFLOWS missing zec_txid
  const { rows: missingInflows } = await pool.query(`
    SELECT deposit_address, direction, recipient, dest_amount, swap_created_at,
           source_chain, source_token, dest_chain, dest_token
    FROM cross_chain_swaps
    WHERE zec_txid IS NULL AND status = 'SUCCESS' AND direction = 'inflow'
    ORDER BY swap_created_at DESC
    LIMIT 5
  `);

  // Pick 5 recent OUTFLOWS missing zec_txid
  const { rows: missingOutflows } = await pool.query(`
    SELECT deposit_address, direction, recipient, source_amount, swap_created_at,
           source_chain, source_token, dest_chain, dest_token
    FROM cross_chain_swaps
    WHERE zec_txid IS NULL AND status = 'SUCCESS' AND direction = 'outflow'
    ORDER BY swap_created_at DESC
    LIMIT 5
  `);

  const allMissing = [...missingInflows, ...missingOutflows];
  const depositSet = new Set(allMissing.map(r => r.deposit_address));

  console.log(`\nLooking for ${depositSet.size} deposit addresses in NEAR API...\n`);

  // Scan API pages to find these specific swaps
  const foundSwaps = new Map();

  for (const direction of ['inflow', 'outflow']) {
    const params = {
      statuses: 'SUCCESS',
      perPage: 100,
      page: 1,
    };
    if (direction === 'inflow') params.toChainId = 'zec';
    else params.fromChainId = 'zec';

    for (let page = 1; page <= 50; page++) {
      if (depositSet.size === 0) break;
      params.page = page;

      try {
        const data = await nearRequest('/transactions-pages', params);
        const txs = data.data || [];
        if (txs.length === 0) break;

        for (const tx of txs) {
          if (depositSet.has(tx.depositAddress)) {
            foundSwaps.set(tx.depositAddress, tx);
            depositSet.delete(tx.depositAddress);
          }
        }

        if (page >= (data.totalPages || 1)) break;
        if (depositSet.size === 0) break;
        await delay(5500);
      } catch (e) {
        console.log(`API error on ${direction} page ${page}: ${e.message}`);
        break;
      }
    }
  }

  // Now dump the raw data for every found swap
  console.log(`\n${'='.repeat(80)}`);
  console.log(`FOUND ${foundSwaps.size}/${allMissing.length} swaps in NEAR API`);
  console.log(`NOT FOUND: ${depositSet.size} (too old or not in recent pages)`);
  console.log(`${'='.repeat(80)}\n`);

  let apiHasHash = 0;
  let apiEmpty = 0;

  for (const [depositAddr, rawTx] of foundSwaps) {
    const dbRow = allMissing.find(r => r.deposit_address === depositAddr);
    
    console.log(`--- ${depositAddr} ---`);
    console.log(`  DB direction: ${dbRow.direction}`);
    console.log(`  DB created_at: ${dbRow.swap_created_at}`);
    console.log(`  DB source: ${dbRow.source_chain}/${dbRow.source_token}`);
    console.log(`  DB dest: ${dbRow.dest_chain}/${dbRow.dest_token}`);
    console.log('');
    console.log('  RAW API RESPONSE (all tx hash fields):');
    console.log(`    status:                    ${rawTx.status}`);
    console.log(`    originAsset:               ${rawTx.originAsset}`);
    console.log(`    destinationAsset:          ${rawTx.destinationAsset}`);
    console.log(`    originChainTxHashes:       ${JSON.stringify(rawTx.originChainTxHashes)}`);
    console.log(`    destinationChainTxHashes:  ${JSON.stringify(rawTx.destinationChainTxHashes)}`);
    console.log(`    nearTxHashes:              ${JSON.stringify(rawTx.nearTxHashes)}`);
    console.log(`    senders:                   ${JSON.stringify(rawTx.senders)}`);
    console.log(`    recipient:                 ${rawTx.recipient}`);
    console.log(`    depositAddress:            ${rawTx.depositAddress}`);
    console.log(`    amountInFormatted:         ${rawTx.amountInFormatted}`);
    console.log(`    amountOutFormatted:        ${rawTx.amountOutFormatted}`);
    console.log(`    createdAt:                 ${rawTx.createdAt}`);

    // Dump ALL other fields we might be missing
    const knownFields = new Set([
      'status', 'originAsset', 'destinationAsset', 'originChainTxHashes',
      'destinationChainTxHashes', 'nearTxHashes', 'senders', 'recipient',
      'depositAddress', 'amountInFormatted', 'amountOutFormatted', 'createdAt',
      'amountIn', 'amountOut', 'amountInUsd', 'amountOutUsd',
    ]);
    const extraFields = Object.keys(rawTx).filter(k => !knownFields.has(k));
    if (extraFields.length > 0) {
      console.log('    --- EXTRA FIELDS WE MIGHT BE MISSING ---');
      for (const f of extraFields) {
        const val = rawTx[f];
        const display = typeof val === 'object' ? JSON.stringify(val) : val;
        console.log(`    ${f}: ${display}`);
      }
    }

    // Verdict for this swap
    const zecField = dbRow.direction === 'inflow' ? 'destinationChainTxHashes' : 'originChainTxHashes';
    const zecHashes = rawTx[zecField] || [];
    if (zecHashes.length > 0) {
      apiHasHash++;
      console.log(`\n  >>> VERDICT: API HAS THE HASH NOW → "${zecHashes[0]}"`);
      console.log(`  >>> We missed it during backfill (timing issue)`);
    } else {
      apiEmpty++;
      console.log(`\n  >>> VERDICT: API RETURNS EMPTY ${zecField}`);
      console.log(`  >>> NEAR API genuinely does not have this ZEC tx hash`);
    }
    console.log('');
  }

  // Final summary
  console.log(`${'='.repeat(80)}`);
  console.log('FINAL VERDICT:');
  console.log(`  API now has the hash (backfill timing): ${apiHasHash}`);
  console.log(`  API genuinely empty:                    ${apiEmpty}`);
  console.log(`  Not found in API pages (too old):       ${depositSet.size}`);
  
  if (apiHasHash > 0) {
    console.log('\n  >> Some hashes appeared AFTER our backfill — the API populates them async.');
    console.log('  >> Running incremental sync + refetchMissingTxids will fix these.');
  }
  if (apiEmpty > 0) {
    console.log('\n  >> Some swaps genuinely lack the ZEC hash in the NEAR API.');
    console.log('  >> The --heal flag can find these from our own blockchain data.');
  }

  await pool.end();
  console.log('\n=== Done ===');
}

main().catch(e => { console.error(e); process.exit(1); });
