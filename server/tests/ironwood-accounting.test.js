const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const migrationRouter = require('../api/routes/migration');

function createPool({ tipHeight, ledger, snapshot = null }) {
  return {
    async query(sql) {
      if (sql.includes('SELECT MAX(height) AS h FROM blocks')) {
        return { rows: [{ h: tipHeight }] };
      }
      if (sql.includes('FROM privacy_stats')) {
        return { rows: snapshot ? [snapshot] : [] };
      }
      if (sql.includes('FROM transactions') && sql.includes('ironwood_out')) {
        return { rows: [ledger] };
      }
      if (sql.includes('MAX(timestamp)')) {
        return { rows: [{ avg_secs: 75 }] };
      }
      throw new Error(`Unexpected SQL in test: ${sql}`);
    },
  };
}

async function requestOverview({ pool, callZebraRPC }) {
  const app = express();
  app.locals.pool = pool;
  app.locals.redisClient = null;
  app.locals.callZebraRPC = callZebraRPC;
  app.use(migrationRouter);

  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/migration/overview`);
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

const balancedLedger = {
  ironwood_in: '2784994099483',
  ironwood_out: '1141570732834',
  orchard_out: '131359849365',
  coinbase_in: '64999725000',
  inflow_tx_count: '2394',
  first_inflow_height: '4134683',
  last_inflow_height: '4177043',
};

test('uses live Zebra valuePools and reconciles indexed inflow minus outflow', async () => {
  const authoritativePoolZat = 1643423366649;
  const result = await requestOverview({
    pool: createPool({ tipHeight: 4177046, ledger: balancedLedger }),
    callZebraRPC: async (method) => {
      assert.equal(method, 'getblockchaininfo');
      return {
        blocks: 4177046,
        valuePools: [
          { id: 'orchard', chainValueZat: 25160904324770 },
          { id: 'ironwood', chainValueZat: authoritativePoolZat },
        ],
      };
    },
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.poolSizes.ironwoodZat, authoritativePoolZat);
  assert.equal(result.body.poolSizes.source, 'zebra');
  assert.equal(result.body.poolSizes.isLive, true);
  assert.equal(result.body.supplyAudit.ironwoodOutZat, 1141570732834);
  assert.equal(result.body.supplyAudit.indexedNetZat, authoritativePoolZat);
  assert.equal(result.body.supplyAudit.differenceZat, 0);
  assert.equal(result.body.supplyAudit.status, 'balanced');
  assert.equal(result.body.supplyAudit.balanced, true);
});

test('discloses a stored snapshot fallback when Zebra is unavailable', async () => {
  const result = await requestOverview({
    pool: createPool({
      tipHeight: 4177046,
      ledger: balancedLedger,
      snapshot: {
        orchard_pool_size: '25160904324770',
        ironwood_pool_size: '1643540856899',
        last_block_scanned: '4177033',
        updated_at: '2026-07-16T22:00:18.509Z',
      },
    }),
    callZebraRPC: async () => {
      throw new Error('RPC unavailable');
    },
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.poolSizes.source, 'privacy_stats');
  assert.equal(result.body.poolSizes.isLive, false);
  assert.equal(result.body.poolSizes.sourceHeight, 4177033);
  assert.equal(result.body.supplyAudit.status, 'stale');
  assert.equal(result.body.supplyAudit.balanced, null);
});

test('reports syncing rather than mismatch while the indexer trails Zebra', async () => {
  const result = await requestOverview({
    pool: createPool({ tipHeight: 4177045, ledger: balancedLedger }),
    callZebraRPC: async () => ({
      blocks: 4177046,
      valuePools: [
        { id: 'orchard', chainValueZat: 25160904324770 },
        { id: 'ironwood', chainValueZat: 1643423366650 },
      ],
    }),
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.supplyAudit.differenceZat, 1);
  assert.equal(result.body.supplyAudit.status, 'syncing');
  assert.equal(result.body.supplyAudit.balanced, null);
});

test('flags a reconciliation mismatch at equal source and accounting heights', async () => {
  const result = await requestOverview({
    pool: createPool({ tipHeight: 4177046, ledger: balancedLedger }),
    callZebraRPC: async () => ({
      blocks: 4177046,
      valuePools: [
        { id: 'orchard', chainValueZat: 25160904324770 },
        { id: 'ironwood', chainValueZat: 1643423366650 },
      ],
    }),
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.supplyAudit.status, 'mismatch');
  assert.equal(result.body.supplyAudit.balanced, false);
});

test('accepts an authoritative zero balance without falling back to cumulative inflow', async () => {
  const zeroLedger = {
    ironwood_in: '0',
    ironwood_out: '0',
    orchard_out: '0',
    coinbase_in: '0',
    inflow_tx_count: '0',
    first_inflow_height: null,
    last_inflow_height: null,
  };
  const result = await requestOverview({
    pool: createPool({ tipHeight: 4134000, ledger: zeroLedger }),
    callZebraRPC: async () => ({
      blocks: 4134000,
      valuePools: [
        { id: 'orchard', chainValueZat: 100000000 },
        { id: 'ironwood', chainValueZat: 0 },
      ],
    }),
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.poolSizes.ironwoodZat, 0);
  assert.equal(result.body.poolSizes.source, 'zebra');
  assert.equal(result.body.supplyAudit.status, 'balanced');
});
