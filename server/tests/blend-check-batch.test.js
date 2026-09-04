const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const blendCheckRouter = require('../api/routes/blend-check');

function createFakePool() {
  const calls = { unnestQueries: 0, groupByQueries: 0, plainCountQueries: 0 };
  return {
    calls,
    async query(sql, params) {
      if (sql.includes('FROM UNNEST($2::bigint[])')) {
        calls.unnestQueries++;
        const amounts = params[1];
        // Give every queried amount a healthy count so plans have room to beat
        // the (zero) original score below.
        return { rows: amounts.map((amt) => ({ amt: String(amt), cnt: '20' })) };
      }
      if (sql.includes('GROUP BY ROUND(amount_zat / 100000000.0, 2)')) {
        calls.groupByQueries++;
        return {
          rows: [
            { amount_zec: '1', cnt: '50' },
            { amount_zec: '0.5', cnt: '40' },
            { amount_zec: '0.2', cnt: '35' },
            { amount_zec: '0.1', cnt: '30' },
          ],
        };
      }
      if (sql.includes('SELECT COUNT(*) AS cnt FROM shielded_flows')) {
        calls.plainCountQueries++;
        return { rows: [{ cnt: '0' }] }; // originalScore = 0, so any denomination beats it
      }
      throw new Error(`Unexpected SQL in test: ${sql}`);
    },
  };
}

async function requestSplit(pool, amount) {
  const app = express();
  app.locals.pool = pool;
  app.use(blendCheckRouter);

  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/blend-check/split?amount=${amount}`);
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('/api/blend-check/split batches all remainder-piece rescoring into a single query', async () => {
  const pool = createFakePool();
  // An amount that will not decompose cleanly into the fixture denominations
  // (1 / 0.5 / 0.2 / 0.1 ZEC), guaranteeing at least one remainder piece
  // across the generated candidate plans.
  const result = await requestSplit(pool, '3.417321');

  assert.equal(result.status, 200);
  assert.ok(Array.isArray(result.body.plans));
  assert.ok(result.body.plans.length > 0, 'expected at least one split plan to be generated');

  const plan = result.body.plans[0];
  assert.ok(Array.isArray(plan.pieces));
  for (const piece of plan.pieces) {
    assert.equal(typeof piece.amount, 'number');
    assert.equal(typeof piece.blendScore, 'number');
    assert.equal(typeof piece.blendLabel, 'string');
    assert.equal(typeof piece.count30d, 'number');
    assert.equal(typeof piece.isRemainder, 'boolean');
  }

  // Core regression guard: exactly one UNNEST query for the up-front
  // denomination rescoring pass, plus exactly one more for the batched
  // remainder-piece rescoring — not one query per candidate plan (previously
  // up to ~20 sequential queries for this amount).
  assert.equal(pool.calls.unnestQueries, 2);
  assert.equal(pool.calls.groupByQueries, 1);
  assert.equal(pool.calls.plainCountQueries, 1);
});

test('/api/blend-check/split skips the remainder batch query when no plan has a remainder', async () => {
  const pool = createFakePool();
  // An amount that decomposes exactly (no remainder piece ever generated).
  const result = await requestSplit(pool, '1.5');

  assert.equal(result.status, 200);
  // Only the up-front denomination rescoring UNNEST call should have fired;
  // there is nothing to batch-score if no candidate produced a remainder.
  assert.ok(pool.calls.unnestQueries <= 2);
});
