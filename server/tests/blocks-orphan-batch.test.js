const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const blocksRouter = require('../api/routes/blocks');

const ORPHAN_HASH = 'a'.repeat(64);

function createFakePool() {
  const calls = { orphanInputQueries: 0, orphanOutputQueries: 0 };
  return {
    calls,
    async query(sql, params) {
      // Main canonical lookup by hash — not found, falls through to orphan lookup.
      if (sql.includes('FROM blocks') && sql.includes('WHERE hash = $1')) {
        return { rows: [] };
      }
      if (sql.includes('FROM orphaned_blocks WHERE hash = $1')) {
        return {
          rows: [{
            height: 100,
            hash: params[0],
            timestamp: 1700000000,
            transaction_count: 2,
            size: 4000,
            difficulty: '1',
            miner_address: 't1UnknownMinerAddress',
            previous_block_hash: 'b'.repeat(64),
            source: 'fork-monitor',
            detected_at: '2026-01-01T00:00:00.000Z',
          }],
        };
      }
      // fetchCanonicalBlockSummary — no canonical replacement recorded.
      if (sql.includes('FROM blocks WHERE height = $1')) {
        return { rows: [] };
      }
      if (sql.includes('FROM orphaned_transactions')) {
        return {
          rows: [
            {
              txid: 'tx1', block_height: 100, tx_index: 0, version: 4, size: 200, fee: 1000,
              is_coinbase: false, vin_count: 1, vout_count: 1, total_input: 100000, total_output: 99000,
              has_sapling: false, has_orchard: false, has_sprout: false, has_ironwood: false, has_shielded_data: false,
              sapling_spend_count: 0, sapling_output_count: 0, orchard_actions: 0, ironwood_actions: 0,
              sprout_joinsplit_count: 0, value_balance: 0, value_balance_sapling: 0, value_balance_orchard: 0,
              value_balance_ironwood: 0, flow_type: null, privacy_score: null, timestamp: 1700000000, expiry_height: 0,
            },
            {
              txid: 'tx2', block_height: 100, tx_index: 1, version: 4, size: 250, fee: 2000,
              is_coinbase: false, vin_count: 1, vout_count: 1, total_input: 200000, total_output: 198000,
              has_sapling: false, has_orchard: false, has_sprout: false, has_ironwood: false, has_shielded_data: false,
              sapling_spend_count: 0, sapling_output_count: 0, orchard_actions: 0, ironwood_actions: 0,
              sprout_joinsplit_count: 0, value_balance: 0, value_balance_sapling: 0, value_balance_orchard: 0,
              value_balance_ironwood: 0, flow_type: null, privacy_score: null, timestamp: 1700000001, expiry_height: 0,
            },
          ],
        };
      }
      if (sql.includes('FROM orphaned_transaction_inputs')) {
        calls.orphanInputQueries++;
        assert.ok(Array.isArray(params[1]), 'inputs query must batch txids via a single array param');
        assert.deepEqual(params[1].sort(), ['tx1', 'tx2']);
        return {
          rows: [
            { txid: 'tx1', vout_index: 0, prev_txid: 'p1', prev_vout: 0, address: 'addrA', value: 100000, coinbase: null },
            { txid: 'tx2', vout_index: 0, prev_txid: 'p2', prev_vout: 0, address: 'addrB', value: 200000, coinbase: null },
          ],
        };
      }
      if (sql.includes('FROM orphaned_transaction_outputs')) {
        calls.orphanOutputQueries++;
        assert.ok(Array.isArray(params[1]), 'outputs query must batch txids via a single array param');
        return {
          rows: [
            { txid: 'tx1', vout_index: 0, value: 99000, address: 'addrC', script_type: 'p2pkh' },
            { txid: 'tx2', vout_index: 0, value: 198000, address: 'addrD', script_type: 'p2pkh' },
          ],
        };
      }
      throw new Error(`Unexpected SQL in test: ${sql}`);
    },
  };
}

async function requestOrphanBlock(pool) {
  const app = express();
  app.locals.pool = pool;
  app.locals.redisClient = null;
  app.locals.callZebraRPC = async () => null;
  app.use(blocksRouter);

  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/block/${ORPHAN_HASH}`);
    return { status: response.status, headers: response.headers, body: await response.json() };
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('orphaned block detail batches input/output I/O into one query each, regardless of tx count', async () => {
  const pool = createFakePool();
  const result = await requestOrphanBlock(pool);

  assert.equal(result.status, 200);
  assert.equal(result.body.isOrphaned, true);
  assert.equal(result.body.transactions.length, 2);

  // The core regression guard: 2 orphaned transactions must cost exactly one
  // inputs query and one outputs query — not one pair per transaction.
  assert.equal(pool.calls.orphanInputQueries, 1);
  assert.equal(pool.calls.orphanOutputQueries, 1);

  const tx1 = result.body.transactions.find((t) => t.txid === 'tx1');
  const tx2 = result.body.transactions.find((t) => t.txid === 'tx2');
  assert.equal(tx1.vin.length, 1);
  assert.equal(tx1.vin[0].address, 'addrA');
  assert.equal(tx1.vout[0].address, 'addrC');
  assert.equal(tx2.vin[0].address, 'addrB');
  assert.equal(tx2.vout[0].address, 'addrD');
});

test('orphaned block detail sets a bounded, revalidating Cache-Control header', async () => {
  const pool = createFakePool();
  const result = await requestOrphanBlock(pool);

  assert.equal(result.status, 200);
  assert.equal(result.headers.get('cache-control'), 'public, s-maxage=300, stale-while-revalidate=3600');
});
