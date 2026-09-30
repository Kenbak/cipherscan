'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');
const { loadBlocks, resolveBlockQuery, blockQuerySchema } = require('../../v1/lib/ask-blocks');
const { chat } = require('../../v1/lib/ask-chat');
const { createAskRouter } = require('../../v1/routes/ask');
const { chatRequestSchema } = require('../../../../lib/ask/chat');
const signal = new AbortController().signal;
const request = { question: 'Tell me about the latest block', page: 'ask', context: null, history: [], locale: 'auto' };
const row = (height, extra = {}) => ({ height: String(height), hash: height.toString(16).padStart(64, '0'), timestamp: String(1700000000 + height * 75), transaction_count: 3, size: 10000, total_fees: '12345', miner_pool: 'Fixture Pool', coinbase_hex: 'f09fa693', ...extra });
const source = rows => ({ dispatch: async (method, path, options) => {
  assert.equal(method, 'GET'); assert.equal(path, '/api/blocks/list'); assert.equal(options.parentSignal, signal);
  assert.ok(Number(options.query.limit) <= 25);
  return { ok: true, body: { success: true, blocks: rows } };
} });
test('latest block uses bounded public data and exact fee/interval/capacity facts', async () => {
  const result = await loadBlocks({ mode: 'latest', identifier: null }, source([row(100), row(99)]), signal);
  assert.equal(result.rows.length, 1);
  assert.equal(result.facts.block_fees, '0.00012345 ZEC');
  assert.equal(result.facts.block_interval, '75 seconds');
  assert.equal(result.facts.block_capacity, '0.50%');
  assert.equal(result.facts.block_software, 'Zebra');
  assert.match(result.dataContext.source, /^\/block\/[a-f0-9]{64}$/);
  assert.match(result.input.scope, /not an independently verified node tip/);
  assert.equal(JSON.stringify(result.input).includes('coinbase_hex'), false);
});
test('recent sample has explicit scope and exact counts, not invented browser filters', async () => {
  const result = await loadBlocks({ mode: 'recent', identifier: null }, source([row(100), row(99)]), signal);
  assert.equal(result.rows.length, 2); assert.equal(result.facts.sample_transactions, '6');
  assert.match(result.input.scope, /unfiltered/);
});
test('specific height is enforced and a hash lookup uses only summary then matching canonical records', async () => {
  let calls = 0;
  const result = await loadBlocks({ mode: 'detail', identifier: row(100).hash }, { dispatch: async (method, path, options) => {
    calls++; assert.equal(method, 'GET');
    if (calls === 1) { assert.equal(path, `/api/block/${row(100).hash}`); assert.deepEqual(options.query, { summary: '1' }); return { ok: true, body: { height: 100, hash: row(100).hash, isOrphaned: false } }; }
    assert.deepEqual(options.query, { limit: '2', min_height: '99', max_height: '100', order: 'newest' });
    return { ok: true, body: { success: true, blocks: [row(100), row(99)] } };
  } }, signal);
  assert.equal(calls, 2); assert.equal(result.rows[0].height, 100);
  await assert.rejects(loadBlocks({ mode: 'detail', identifier: '100' }, source([row(101)]), signal), /filter ignored/);
});
test('missing, orphaned, unavailable and zero values remain distinct', async () => {
  assert.equal((await loadBlocks({ mode: 'detail', identifier: '100' }, source([]), signal)).status, 'not-found');
  const orphan = await loadBlocks({ mode: 'detail', identifier: row(100).hash }, { dispatch: async () => ({ ok: true, body: { hash: row(100).hash, isOrphaned: true } }) }, signal);
  assert.equal(orphan.status, 'orphaned'); assert.equal(orphan.rows.length, 0);
  const result = await loadBlocks({ mode: 'latest', identifier: null }, source([row(0, { total_fees: null, miner_pool: null, size: 0 })]), signal);
  assert.equal(result.facts.block_fees, 'Unavailable'); assert.equal(result.facts.block_capacity, '0.00%'); assert.equal(result.facts.block_interval, 'Unavailable');
});
test('invalid identifiers, ignored limits, duplicate/gapped heights and unsafe data fail closed', async () => {
  for (const identifier of ['../secrets', 'https://private', '1?summary=0', '001', '-1', '1; DROP TABLE blocks']) {
    assert.equal(chatRequestSchema.safeParse({ ...request, block: identifier }).success, false);
    assert.equal(blockQuerySchema.safeParse({ mode: 'detail', identifier }).success, false);
  }
  for (const rows of [[row(100), row(100)], [row(100), row(98)], [row(100, { total_fees: -1 })], [row(100, { size: null })], [row(100, { timestamp: 'bad' })], [row(100),row(99),row(98)]]) await assert.rejects(loadBlocks({ mode: 'latest', identifier: null }, source(rows), signal));
  await assert.rejects(loadBlocks({ mode: 'latest', identifier: '100' }, source([]), signal));
  await assert.rejects(loadBlocks({ mode: 'detail', identifier: row(100).hash }, { dispatch: async (method, path) => path.startsWith('/api/block/') ? { ok: true, body: { hash: row(100).hash, height: 100 } } : { ok: true, body: { success: true, blocks: [row(100, { hash: 'b'.repeat(64) })] } } }, signal), /changed during lookup/);
});
test('shortcuts are exact, preserve current block context and do not swallow extra instructions', () => {
  assert.deepEqual(resolveBlockQuery(request), { mode: 'latest', identifier: null });
  assert.deepEqual(resolveBlockQuery({ ...request, page: 'blocks', question: 'Explain this page' }), { mode: 'recent', identifier: null });
  assert.deepEqual(resolveBlockQuery({ ...request, page: 'block', block: '100', question: 'Explain this page' }), { mode: 'detail', identifier: '100' });
  assert.equal(resolveBlockQuery({ ...request, question: request.question + ' and write cupcakes' }), null);
});
test('AI explains fetched block facts; free-form French block questions can classify to the same tool', async () => {
  let calls = 0;
  const run = async (body, task) => {
    calls++;
    if (task.name === 'contextual_intent') return task.validator.parse({ intent: 'blocks', transactionQuery: null, blockQuery: { mode: 'latest', identifier: null }, flowQuery: null, spec: null, topics: ['block'], locale: 'fr' });
    assert.equal(body.evidence.facts.block_height, '100');
    return task.validator.parse({ summary: 'Bloc {{block_height}} : {{block_transactions}} transactions.', observations: ['Occupation : {{block_capacity}}.'], limitation: '', sources: ['block'] });
  };
  const result = await chat(request, run, source([row(100), row(99)]), signal, '');
  assert.equal(calls, 1); assert.match(result.answer, /Bloc 100/); assert.equal(result.blocks.rows[0].height, 100);
  calls = 0;
  const french = await chat({ ...request, question: 'Peux-tu analyser le dernier bloc Zcash ?' }, run, source([row(100), row(99)]), signal, '');
  assert.equal(calls, 2); assert.equal(french.locale, 'fr');
});
test('guided HTTP lookups return real block results without a provider and reject untrusted paths', async t => {
  const app = express(); app.use(express.json()); app.use((req, res, next) => { req.v1 = { network: 'mainnet', abortSignal: signal }; next(); });
  const router = createAskRouter({}, { internalClient: { dispatch: async () => ({ ok: true, body: { success: true, blocks: [row(100), row(99)] } }) } });
  app.use('/ask', router); const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { router.stop(); server.closeAllConnections(); server.close(); });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/ask/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
  assert.equal(response.status, 200); const result = (await response.json()).data;
  assert.equal(result.mode, 'guided'); assert.equal(result.blocks.rows[0].height, 100); assert.match(result.answer, /latest indexed block is 100/);
});
