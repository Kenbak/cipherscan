const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const addressRouter = require('../api/routes/address');
const transparentRouter = require('../api/routes/transparent');

async function request(router, pool, path) {
  const app = express();
  app.locals.pool = pool;
  app.use(router);

  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

const validAddress = 't1Hsc1LR8yKnbbe3twRp88p6vFfC5t7DLbs';

test('address endpoint rejects negative summaries instead of masking them to zero', async () => {
  const logged = [];
  const originalError = console.error;
  console.error = (...args) => logged.push(args.join(' '));

  try {
    const result = await request(addressRouter, {
      async query(sql) {
        assert.match(sql, /FROM addresses/);
        return {
          rows: [{
            address: validAddress,
            total_received: '100',
            total_sent: '101',
            balance: '-1',
            tx_count: '2',
            first_seen: 1,
            last_seen: 2,
          }],
        };
      },
    }, `/api/address/${validAddress}`);

    assert.equal(result.status, 500);
    assert.equal(result.body.code, 'ADDRESS_SUMMARY_INCONSISTENT');
    assert.equal(JSON.stringify(result.body).includes(validAddress), false);
    assert.equal(logged.some((entry) => entry.includes(validAddress)), false);
  } finally {
    console.error = originalError;
  }
});

test('address endpoint rejects internally inconsistent non-negative summaries', async () => {
  const originalError = console.error;
  console.error = () => {};

  try {
    const result = await request(addressRouter, {
      async query() {
        return {
          rows: [{
            address: validAddress,
            total_received: '500',
            total_sent: '100',
            balance: '399',
            tx_count: '2',
            first_seen: 1,
            last_seen: 2,
          }],
        };
      },
    }, `/api/address/${validAddress}`);

    assert.equal(result.status, 500);
    assert.equal(result.body.code, 'ADDRESS_SUMMARY_INCONSISTENT');
  } finally {
    console.error = originalError;
  }
});

test('valid unused addresses retain the existing zero-balance lifecycle response', async () => {
  const result = await request(addressRouter, {
    async query(sql, params) {
      assert.match(sql, /FROM addresses/);
      assert.deepEqual(params, [validAddress]);
      return { rows: [] };
    },
  }, `/api/address/${validAddress}`);

  assert.equal(result.status, 200);
  assert.equal(result.body.address, validAddress);
  assert.equal(result.body.balance, 0);
  assert.equal(result.body.note, 'This address has no transaction history yet.');
});

test('exposed address list links disclosed keys without adding direct output value', async () => {
  const statements = [];
  const result = await request(transparentRouter, {
    async query(sql) {
      statements.push(sql);
      assert.match(sql, /transparent_key_exposures/);
      assert.match(sql, /e\.derived_address = a\.address/);
      assert.match(sql, /a\.total_sent > 0/);

      if (/SELECT COUNT\(\*\)/.test(sql)) return { rows: [{ count: '1' }] };
      return {
        rows: [{
          address: validAddress,
          balance: '500000000',
          total_sent: '100',
          exposure_reason: 'spent',
          script_type: 'pubkeyhash',
        }],
      };
    },
  }, '/api/transparent/exposed?limit=10');

  assert.equal(result.status, 200);
  assert.equal(result.body.addresses.length, 1);
  assert.equal(result.body.addresses[0].balance, 500000000);
  assert.equal(result.body.coverage.directAddressless, 'reported_by_summary');
  assert.equal(statements.length, 2);
});

test('unspent reusable address can be exposed by a matching direct public key', async () => {
  const result = await request(transparentRouter, {
    async query(sql) {
      assert.match(sql, /OR EXISTS/);
      assert.match(sql, /e\.derived_address = a\.address/);
      if (/SELECT COUNT\(\*\)/.test(sql)) return { rows: [{ count: '1' }] };
      return {
        rows: [{
          address: validAddress,
          balance: '250000000',
          total_sent: '0',
          exposure_reason: 'public_key_disclosed',
          script_type: 'pubkeyhash',
        }],
      };
    },
  }, '/api/transparent/exposed?limit=10');

  assert.equal(result.status, 200);
  assert.equal(result.body.addresses[0].balance, 250000000);
  assert.equal(result.body.addresses[0].exposure_reason, 'public_key_disclosed');
});

test('exposed summary reports direct addressless UTXOs once and separately', async () => {
  let directSql = '';
  const result = await request(transparentRouter, {
    async query(sql) {
      if (/WITH direct_outputs/.test(sql)) {
        directSql = sql;
        return {
          rows: [{
            output_count: '3',
            exposed_key_count: '5',
            total_balance: '700000000',
            p2pk_output_count: '2',
            p2pk_balance: '400000000',
            multisig_output_count: '1',
            multisig_balance: '300000000',
          }],
        };
      }

      assert.match(sql, /transparent_key_exposures/);
      return { rows: [{ total_addresses: '2', total_balance: '1000000000' }] };
    },
  }, '/api/transparent/exposed/summary');

  assert.equal(result.status, 200);
  assert.equal(result.body.total_balance, 1000000000);
  assert.equal(result.body.directAddressless.output_count, 3);
  assert.equal(result.body.directAddressless.exposed_key_count, 5);
  assert.equal(result.body.directAddressless.total_balance, 700000000);
  assert.equal(result.body.combined_total_balance, 1700000000);
  assert.equal(result.body.coverage.mutuallyExclusive, true);
  assert.match(directSql, /GROUP BY txid, vout_index/);
  assert.match(directSql, /o\.address IS NULL/);
  assert.match(directSql, /NOT EXISTS/);
  assert.match(directSql, /i\.prev_txid = d\.txid AND i\.prev_vout = d\.vout_index/);
});

test('rich-list keeps direct outputs out of rankings but includes them in supply math', async () => {
  const statements = [];
  const result = await request(addressRouter, {
    async query(sql) {
      statements.push(sql);
      if (/SELECT a\.address/.test(sql)) return { rows: [] };
      if (/SELECT COUNT\(\*\)/.test(sql)) return { rows: [{ count: '0' }] };
      assert.match(sql, /transparent_key_exposures/);
      assert.match(sql, /GROUP BY txid, vout_index/);
      assert.match(sql, /NOT EXISTS/);
      return {
        rows: [{
          top10: '500000000',
          top100: '500000000',
          total_addressed: '500000000',
          direct_addressless: '100000000',
          total_transparent: '600000000',
        }],
      };
    },
  }, '/api/rich-list?limit=10');

  assert.equal(result.status, 200);
  assert.equal(result.body.addresses.length, 0);
  assert.equal(result.body.concentration.totalAddressed, 5);
  assert.equal(result.body.concentration.directAddressless, 1);
  assert.equal(result.body.concentration.totalTransparent, 6);
  assert.equal(result.body.concentration.top10Pct, (5 / 6) * 100);
  assert.equal(statements.length, 3);
  assert.doesNotMatch(statements[0], /transaction_outputs|transparent_key_exposures/);
});
