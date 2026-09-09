'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');
const { createAskRouter, interpret, providerConfig } = require('../../v1/routes/ask');
const { analysisSchema, requestSchema, starters, resolveShortcut } = require('../../../../lib/ask/contract');
const sample = starters[0].spec;
const { explainRequestSchema, loadExplanationEvidence, renderExplanation } = require('../../v1/lib/ask-explanation');
const createV1Router = require('../../v1');

test('Ask rejects oversized JSON before interpretation in standalone and already-parsed hosts', async t => {
  for (const parentParses of [false, true]) {
    const app = express();
    if (parentParses) app.use(express.json({ limit: '1mb' }));
    const router = createV1Router({ API_V1_ENABLED: 'true', API_V1_LAUNCHED: 'true', NEXT_PUBLIC_NETWORK: 'mainnet', ASK_ENABLED: 'false' });
    app.use('/v1', router);
    const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(() => { router.__stopRateLimiters(); server.closeAllConnections(); server.close(); });
    const url = `http://127.0.0.1:${server.address().port}/v1/ask`;
    for (const suffix of ['', '/explain']) {
      const response = await fetch(`${url}${suffix}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'x'.repeat(17000) }) });
      assert.equal(response.status, 413);
      assert.match(response.headers.get('content-type'), /application\/problem\+json/);
      assert.match((await response.json()).detail, /16 KiB/);
    }
  }
});

test('starter questions and supported follow-ups produce validated analysis specifications', () => {
  for (const starter of starters) assert.deepEqual(analysisSchema.parse(resolveShortcut(starter.title)), starter.spec);
  assert.equal(resolveShortcut('show 90 days', sample).period, '90d');
  assert.equal(resolveShortcut('just Orchard', sample).pool, 'orchard');
  assert.equal(resolveShortcut('show as a table', sample).view, 'table');
  for (const question of ['who owns Orchard funds?', 'predict ZEC price', 'show 90 days and identify the sender', 'show 90 days']) {
    assert.equal(resolveShortcut(question), null);
  }
});

test('unknown tools, arbitrary execution, unsupported networks and oversized input fail the shared contract', () => {
  for (const spec of [{ ...sample, metric: 'sql' }, { ...sample, sql: 'SELECT 1' }, { ...sample, network: 'testnet' }, { ...sample, period: '10y' }, { ...sample, pool: 'arbitrary' }]) assert.equal(analysisSchema.safeParse(spec).success, false);
  assert.equal(requestSchema.safeParse({ question: 'x'.repeat(1001), context: null }).success, false);
  assert.equal(requestSchema.safeParse({ question: ' ', context: null }).success, false);
});

const env = { ASK_ENABLED: 'true', ASK_PROVIDER: 'openai', ASK_MODEL: 'test-model', ASK_API_KEY: 'test-key', ASK_DAILY_CALL_LIMIT: '5' };
test('paid interpretation fails closed unless provider, model and explicit daily limit are configured', () => {
  assert.equal(providerConfig({}), null);
  for (const key of Object.keys(env)) assert.equal(providerConfig({ ...env, [key]: '' }), null);
  assert.equal(providerConfig({ ...env, ASK_DAILY_CALL_LIMIT: 'NaN' }), null);
  assert.equal(providerConfig({ ...env, ASK_PROVIDER: 'arbitrary-url' }), null);
  assert.equal(providerConfig({ ...env, ASK_REASONING_EFFORT: 'unbounded' }), null);
  assert.equal(providerConfig({ ...env, ASK_PROVIDER: 'anthropic', ASK_REASONING_EFFORT: 'none' }), null);
  assert.equal(providerConfig(env).dailyCalls, 5);
});

test('provider output is validated and only the bounded interpretation request is sent', async () => {
  const result = await interpret(providerConfig({ ...env, ASK_REASONING_EFFORT: 'none' }), { question: 'show pools', context: null }, new AbortController().signal, async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/chat/completions');
    const body = JSON.parse(init.body);
    assert.equal(body.store, false); assert.equal(body.max_completion_tokens, 500);
    assert.equal(body.reasoning_effort, 'none');
    assert.equal(body.messages.length, 2); assert.equal(body.response_format.json_schema.strict, true);
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ spec: sample }) } }] });
  });
  assert.deepEqual(result.spec, sample);
  for (const content of [{ spec: { ...sample, metric: 'sql' } }, { spec: sample, answer: 'invented claim' }]) {
    await assert.rejects(interpret(providerConfig(env), {}, new AbortController().signal, async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }] })));
  }
  await assert.rejects(interpret(providerConfig(env), {}, new AbortController().signal, async () => new Response('x'.repeat(40000))));
});

test('Anthropic adapter requires exactly one completed allowlisted tool call', async () => {
  const config = providerConfig({ ...env, ASK_PROVIDER: 'anthropic' });
  assert.deepEqual(await interpret(config, {}, new AbortController().signal, async (url, init) => {
    assert.equal(url, 'https://api.anthropic.com/v1/messages');
    assert.equal(JSON.parse(init.body).tool_choice.name, 'select_analysis');
    return Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'select_analysis', input: { spec: null } }] });
  }), { spec: null });
  await assert.rejects(interpret(config, {}, new AbortController().signal, async () => Response.json({ stop_reason: 'max_tokens', content: [] })));
});

async function serve(t, network = 'mainnet', overrides = {}, dependencies = {}) {
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { req.v1 = { network, requestId: 'test', abortSignal: new AbortController().signal }; next(); });
  const router = createAskRouter(overrides, dependencies); app.use('/ask', router);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { router.stop(); server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}/ask`;
  return { url, post: body => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) };
}

test('native route supports guided mode without credentials, never caches conversations, and rejects query strings', async t => {
  const api = await serve(t);
  const status = await fetch(api.url); assert.equal((await status.json()).data.mode, 'guided');
  assert.equal(status.headers.get('cache-control'), 'private, no-store');
  const result = await api.post({ question: starters[0].title, context: null });
  assert.equal(result.status, 200); assert.deepEqual((await result.json()).data.spec, sample);
  assert.equal((await api.post({ question: 'interpret anything', context: null })).status, 503);
  assert.equal((await fetch(`${api.url}?question=do-not-put-prompts-in-urls`)).status, 400);
  assert.equal((await api.post({ question: 'test', context: { ...sample, sql: 'no' } })).status, 400);
});

test('testnet and Crosslink cannot expose Ask', async t => {
  for (const network of ['testnet', 'crosslink-testnet']) {
    const api = await serve(t, network);
    assert.equal((await fetch(api.url)).status, 404);
    assert.equal((await api.post({ question: starters[0].title, context: null })).status, 404);
  }
});

test('shared quota denial or Redis failure cannot reach the paid provider', async t => {
  let calls = 0;
  for (const failure of ['quota', 'redis']) {
    const api = await serve(t, 'mainnet', env, { redis: { isReady: true, eval: async () => { if (failure === 'redis') throw new Error('redis down'); return 0; } }, fetch: async () => { calls++; } });
    const result = await api.post({ question: 'show my supported dataset', context: null });
    assert.equal(result.status, failure === 'quota' ? 429 : 503);
  }
  assert.equal(calls, 0);
});

test('paid requests reserve a shared daily slot, release concurrency and retain the consumed reservation', async t => {
  let removed = false; let reserved = false;
  const api = await serve(t, 'mainnet', env, {
    redis: { isReady: true, eval: async (script, options) => { assert.ok(script.includes('ZCARD')); assert.ok(script.includes('INCR')); assert.equal(options.arguments[2], '5'); reserved = true; return 1; }, zRem: async () => { removed = true; } },
    fetch: async () => { assert.equal(reserved, true); return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ spec: sample }) } }] }); },
  });
  const result = await api.post({ question: 'interpret this question', context: null });
  assert.equal(result.status, 200); assert.deepEqual((await result.json()).data.spec, sample);
  assert.equal(removed, true);
});

test('explanations use server-fetched evidence with fingerprints tied to dates, pool and observations', async () => {
  const source = { dispatch: async (method, route, options) => {
    assert.equal(method, 'GET'); assert.equal(route, '/api/network/pool-history'); assert.equal(options.query.format, 'zatoshi');
    return { ok: true, body: { points: [{ date: '2026-08-01', orchardZat: '100000000', hasPoolBreakdown: true }, { date: '2026-08-02', orchardZat: '200000000', hasPoolBreakdown: true }] } };
  } };
  const spec = { ...sample, pool: 'orchard' };
  const evidence = await loadExplanationEvidence(spec, source, new AbortController().signal);
  assert.equal(evidence.facts.orchard_value, '2.00 ZEC'); assert.equal(evidence.facts.orchard_change, '+1.00 ZEC');
  assert.equal(evidence.input.series[0].direction, 'increased');
  assert.notEqual(evidence.evidenceKey, (await loadExplanationEvidence({ ...spec, start: '2026-08-02' }, source, new AbortController().signal)).evidenceKey);
  assert.equal(explainRequestSchema.safeParse({ spec, evidenceKey: evidence.evidenceKey, data: 'client invented evidence' }).success, false);
  const narrative = renderExplanation({ summary: 'Orchard held {{orchard_value}} at the end of the window.', observations: ['Its balance changed by {{orchard_change}}.'], limitation: 'Balance changes alone do not prove migration.' }, evidence.facts);
  assert.equal(narrative.observations[0], 'Its balance changed by +1.00 ZEC.');
  for (const text of ['Invented 42 ZEC.', 'An unknown {{made_up}}.', '<script>bad</script>', 'See https://untrusted.test']) {
    assert.throws(() => renderExplanation({ summary: text, observations: ['Test'], limitation: 'Test' }, evidence.facts));
  }
});

test('a changed evidence snapshot cannot trigger a provider explanation for an old chart', async t => {
  let calls = 0;
  const api = await serve(t, 'mainnet', env, {
    redis: { isReady: true, eval: async () => 1, zRem: async () => {} },
    internalClient: { dispatch: async () => ({ ok: true, body: { points: [{ date: '2026-08-01', orchardZat: '100000000', hasPoolBreakdown: true }] } }) },
    fetch: async () => { calls++; },
  });
  const result = await fetch(`${api.url}/explain`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spec: { ...sample, pool: 'orchard' }, evidenceKey: '0'.repeat(64) }) });
  assert.equal(result.status, 200); const body = await result.json();
  assert.equal(body.data.reason, 'source-changed'); assert.equal(body.data.explanation, null); assert.equal(calls, 0);
});

test('an explanation response contains only validated narrative for the exact chart snapshot', async t => {
  const internalClient = { dispatch: async () => ({ ok: true, body: { points: [{ date: '2026-08-01', orchardZat: '100000000', hasPoolBreakdown: true }] } }) };
  const spec = { ...sample, pool: 'orchard' };
  const evidence = await loadExplanationEvidence(spec, internalClient, new AbortController().signal);
  const api = await serve(t, 'mainnet', env, {
    redis: { isReady: true, eval: async () => 1, zRem: async () => {} }, internalClient,
    fetch: async (url, init) => {
      const body = JSON.parse(init.body); assert.equal(body.response_format.json_schema.name, 'explain_analysis');
      assert.equal(JSON.parse(body.messages[1].content).facts.orchard_value, '1.00 ZEC');
      return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ summary: 'The observed Orchard balance was {{orchard_value}}.', observations: ['The source covers {{observation_count}} daily observation.'], limitation: 'This does not reveal private payments.' }) } }] });
    },
  });
  const response = await fetch(`${api.url}/explain`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spec, evidenceKey: evidence.evidenceKey }) });
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const body = await response.json(); assert.equal(body.data.explanation.summary, 'The observed Orchard balance was 1.00 ZEC.'); assert.equal(body.data.evidenceKey, evidence.evidenceKey);
});
