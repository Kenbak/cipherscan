'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');
const { loadTransactions, resolveTransactionQuery, transactionFallback } = require('../../v1/lib/ask-transactions');
const { chat } = require('../../v1/lib/ask-chat');
const { createAskRouter } = require('../../v1/routes/ask');
const { chatRequestSchema } = require('../../../../lib/ask/chat');
const { describePage } = require('../../../../lib/ask/pages');
const signal = new AbortController().signal;
const id = 'a'.repeat(64), hash = 'b'.repeat(64);
const request = { question: `Explain transaction ${id}`, page: 'ask', context: null, history: [], locale: 'auto' };
const detail = { txid: id, blockHeight: 100, blockHash: hash, blockTime: 1700000000, status: 'confirmed', isCanonical: true, confirmations: 5, feeZat: '9007199254740993', size: 1234, hasSprout: false, hasSapling: false, hasOrchard: true, hasIronwood: false, isCoinbase: false, vinCount: 1, voutCount: 0 };
const query = { mode: 'detail', txid: id, limit: 1 };
const latest = { mode: 'latest', txid: null, limit: 5 };
const listRow = (index, extra = {}) => ({ txid: String(index).padStart(64, '0'), block_height: '100', block_hash: hash, block_time: '1700000000', tx_index: index, size: 1000, fee: '10000', has_sprout: false, has_sapling: false, has_orchard: true, has_ironwood: false, is_coinbase: false, vin_count: 0, vout_count: 0, ...extra });
const source = body => ({ dispatch: async (method, path, options) => { assert.equal(method, 'GET'); assert.equal(path, `/api/seo/tx/${id}`); assert.equal(options.parentSignal, signal); return { ok: true, body }; } });
const listSource = rows => ({ dispatch: async (method, path, options) => { assert.equal(method, 'GET'); assert.equal(path, '/api/transactions/list'); assert.deepEqual(options.query, { limit: '5' }); return { ok: true, body: { success: true, transactions: rows } }; } });
test('detail has exact fees, lifecycle, public components and no raw payloads', async () => {
  const result = await loadTransactions(query, source({ ...detail, outputs: ['private fixture'], raw: 'discard', memo: 'discard' }), signal);
  assert.equal(result.facts.tx_a_fee, '90071992.54740993 ZEC');
  assert.equal(result.facts.tx_a_confirmations, '5'); assert.equal(result.facts.tx_a_components, 'Orchard');
  assert.equal(result.rows[0].status, 'confirmed'); assert.equal(result.dataContext.source, `/tx/${id}`);
  assert.equal(JSON.stringify(result).includes('private fixture'), false);
  assert.match(transactionFallback(result), /confirmed in block 100/);
});
test('missing fee is unavailable, zero is exact zero; stale records are not confirmed', async () => {
  for (const [feeZat, expected] of [[undefined, 'Unavailable'], [null, 'Unavailable'], ['0', '0.00000000 ZEC']]) {
    const result = await loadTransactions(query, source({ ...detail, feeZat, fee: 0.1 }), signal);
    assert.equal(result.facts.tx_a_fee, expected);
  }
  const stale = await loadTransactions(query, source({ ...detail, isCanonical: false, status: 'stale', confirmations: 0 }), signal);
  assert.match(transactionFallback(stale), /no longer on the canonical chain/);
});
test('404 falls back to exactly one mempool lookup, pending never invents a block time or fee', async () => {
  for (const inMempool of [true, false]) {
    let calls = 0;
    const result = await loadTransactions(query, { dispatch: async (method, path) => {
      assert.equal(method, 'GET');
      if (++calls === 1) { assert.equal(path, `/api/seo/tx/${id}`); return { ok: false, status: 404 }; }
      assert.equal(path, `/api/mempool/tx/${id}`);
      return { ok: true, body: { success: true, inMempool, transaction: { txid: id, size: 100, firstSeen: 1700000000, outputs: ['not forwarded'] } } };
    } }, signal);
    assert.equal(calls, 2);
    if (inMempool) { assert.equal(result.rows[0].status, 'pending'); assert.equal(result.rows[0].timestamp, null); assert.equal(result.rows[0].feeZat, null); assert.equal(result.dataContext.end, null); }
    else { assert.equal(result.status, 'not-found'); assert.match(transactionFallback(result), /not found/); }
  }
});
test('upstream failure is not a missing transaction; mismatched IDs/status and malformed values fail closed', async () => {
  let calls = 0;
  await assert.rejects(loadTransactions(query, { dispatch: async () => { calls++; return { ok: false, status: 500 }; } }, signal), /unavailable/);
  assert.equal(calls, 1);
  for (const change of [{ txid: hash }, { confirmations: 0 }, { isCanonical: false }, { feeZat: -1 }, { size: 'garbage' }, { feeZat: Number.MAX_SAFE_INTEGER + 1 }]) await assert.rejects(loadTransactions(query, source({ ...detail, ...change }), signal));
});
test('latest is bounded, ordered by indexed position and does not invent canonical confirmation', async () => {
  const result = await loadTransactions(latest, listSource([listRow(2), listRow(1)]), signal);
  assert.equal(result.rows.length, 2); assert.equal(result.rows[0].status, 'indexed'); assert.equal(result.rows[0].confirmations, null);
  assert.match(result.input.scope, /not browser table filters/); assert.equal(result.facts.result_count, '2');
  for (const rows of [[listRow(1), listRow(2)], [listRow(1), listRow(1)], Array.from({ length: 6 }, (_, i) => listRow(6 - i))]) await assert.rejects(loadTransactions(latest, listSource(rows), signal));
});
test('strict identifiers, query combinations, caps and exact shortcuts reject arbitrary paths and discarded instructions', async () => {
  for (const transaction of ['../admin', 'https://private', '1', `${id}?raw=1`, 'a'.repeat(65)]) assert.equal(chatRequestSchema.safeParse({ ...request, transaction }).success, false);
  for (const bad of [{ ...query, limit: 2 }, { ...latest, txid: id }, { ...latest, limit: 11 }, { ...query, txid: '../private' }]) await assert.rejects(loadTransactions(bad, source(detail), signal));
  assert.deepEqual(resolveTransactionQuery(request), query);
  assert.deepEqual(resolveTransactionQuery({ ...request, question: 'Explain this page', page: 'transaction', transaction: id }), query);
  assert.deepEqual(resolveTransactionQuery({ ...request, question: 'Explain this page', page: 'transactions' }), latest);
  assert.deepEqual(resolveTransactionQuery({ ...request, question: 'Show the latest 5 transactions' }), latest);
  assert.equal(resolveTransactionQuery({ ...request, question: 'Tell me about the latest transaction' }).limit, 1);
  for (const question of ['Show the latest 11 transactions', 'Show the latest 5 transactions and write cupcakes', 'Show the biggest transactions']) assert.equal(resolveTransactionQuery({ ...request, question }), null);
  assert.equal(describePage('/txs').id, 'transactions');
});
test('AI narration uses fetched transaction facts; French selection reaches the same bounded tool', async () => {
  let calls = 0;
  const result = await chat({ ...request, question: 'Explique cette transaction', transaction: id }, async (body, task) => {
    calls++;
    if (task.name === 'contextual_intent') return task.validator.parse({ intent: 'transactions', transactionQuery: query, blockQuery: null, flowQuery: null, spec: null, topics: ['transactions'], locale: 'fr' });
    assert.equal(body.evidence.facts.tx_a_status, 'confirmed');
    return task.validator.parse({ summary: 'Transaction confirmée dans le bloc {{tx_a_block}}.', observations: ['Frais : {{tx_a_fee}}.'], limitation: '', sources: ['transactions'] });
  }, source(detail), signal, '');
  assert.equal(calls, 2); assert.equal(result.locale, 'fr'); assert.match(result.answer, /bloc 100/); assert.equal(result.transactions.rows[0].txid, id);
});
test('guided HTTP transaction lookup works with AI disabled and rejects spoofed context', async t => {
  const app = express(); app.use(express.json()); app.use((req, res, next) => { req.v1 = { network: 'mainnet', abortSignal: signal }; next(); });
  const router = createAskRouter({}, { internalClient: { dispatch: async () => ({ ok: true, body: detail }) } }); app.use('/ask', router);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { router.stop(); server.closeAllConnections(); server.close(); });
  const post = body => fetch(`http://127.0.0.1:${server.address().port}/ask/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const response = await post(request); assert.equal(response.status, 200);
  const result = (await response.json()).data;
  assert.equal(result.mode, 'guided'); assert.equal(result.transactions.rows[0].txid, id);
  assert.match(result.answer, /confirmed in block 100/);
  const invalid = await post({ ...request, transaction: '../secrets' }); assert.equal(invalid.status, 400);
});
