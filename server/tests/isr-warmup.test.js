const assert = require('node:assert/strict');
const { access, mkdtemp, readFile, rm, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const repositoryRoot = path.resolve(__dirname, '../..');
const library = import(pathToFileURL(
  path.join(repositoryRoot, 'scripts/perf/isr-warmup-lib.mjs'),
).href);
const cli = import(pathToFileURL(
  path.join(repositoryRoot, 'scripts/perf/warm-isr.mjs'),
).href);

function utf16be(text) {
  const littleEndian = Buffer.from(text, 'utf16le');
  const bigEndian = Buffer.alloc(littleEndian.length);
  for (let index = 0; index < littleEndian.length; index += 2) {
    bigEndian[index] = littleEndian[index + 1];
    bigEndian[index + 1] = littleEndian[index];
  }
  return Buffer.concat([Buffer.from([0xfe, 0xff]), bigEndian]);
}

function makeResponse({
  chunks = [Buffer.from('ok')],
  contentType = 'text/html; charset=utf-8',
  headers = {},
  status = 200,
} = {}) {
  const state = { cancelCalls: 0, chunksRead: 0 };
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new Uint8Array(chunk));
      controller.close();
    },
    cancel() { state.cancelCalls += 1; },
  });
  const responseHeaders = new Headers(headers);
  if (contentType !== null) responseHeaders.set('content-type', contentType);
  const reader = body.getReader.bind(body);
  body.getReader = () => {
    const original = reader();
    return {
      ...original,
      async read() {
        const result = await original.read();
        if (!result.done) state.chunksRead += 1;
        return result;
      },
      cancel: (...args) => original.cancel(...args),
      releaseLock: () => original.releaseLock(),
    };
  };
  return {
    response: {
      body,
      headers: responseHeaders,
      ok: status >= 200 && status < 300,
      redirected: false,
      status,
      url: 'https://cipherscan.app/blocks',
    },
    state,
  };
}

function bodyBytes(result) {
  return typeof result === 'number' ? result : result.bytes;
}

function bodyComplete(observation) {
  return observation.body?.complete ?? observation.bodyComplete;
}

function completeObservation(target, overrides = {}) {
  return {
    requestedUrl: target.url,
    status: 200,
    ok: true,
    httpOk: true,
    eligible: true,
    bodyComplete: true,
    body: { disposition: 'drained', bytes: 2, complete: true, reason: null },
    bodyBytes: 2,
    headers: {},
    cache: {
      netlify: {
        edge: { state: 'MISS' },
        durable: { state: 'UNKNOWN' },
      },
      application: 'UNKNOWN',
      vercel: 'UNKNOWN',
    },
    error: null,
    ...overrides,
  };
}

function notAttemptedCount(value) {
  return Array.isArray(value) ? value.length : value;
}

function assertNoTtfbClaims(value) {
  const forbidden = /ttfb|responseHeadersMs|totalMs|under.?200|underThreshold|medianMs|p\d{2}Ms|performancePassed/i;
  const visit = (candidate) => {
    if (!candidate || typeof candidate !== 'object') return;
    for (const [key, nested] of Object.entries(candidate)) {
      assert.doesNotMatch(key, forbidden, `warm-up output must not expose performance field ${key}`);
      visit(nested);
    }
  };
  visit(value);
}

async function withCliState(callback) {
  const previousExitCode = process.exitCode;
  const previousLog = console.log;
  const previousError = console.error;
  const logs = [];
  const errors = [];
  process.exitCode = undefined;
  console.log = (...values) => logs.push(values.join(' '));
  console.error = (...values) => errors.push(values.join(' '));
  try {
    return await callback({ errors, logs });
  } finally {
    process.exitCode = previousExitCode;
    console.log = previousLog;
    console.error = previousError;
  }
}

async function cliFixture(urls = ['https://cipherscan.app/blocks']) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cipherscan-isr-cli-'));
  const input = path.join(directory, 'urls.json');
  const output = path.join(directory, 'artifact.json');
  await writeFile(input, `${JSON.stringify({ schemaVersion: 1, urls })}\n`, 'utf8');
  return { directory, input, output };
}

test('decodes UTF-8 BOM plus UTF-16 little- and big-endian input', async () => {
  const { decodeInput } = await library;
  const text = 'url,label\r\nhttps://cipherscan.app/blocks,blocks\r\n';
  const utf8 = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text)]);
  const utf16le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);

  assert.equal(decodeInput(utf8), text);
  assert.equal(decodeInput(utf16le), text);
  assert.equal(decodeInput(utf16be(text)), text);
});

test('extracts JSON string and object URL rows without losing labels', async () => {
  const { extractInputRows } = await library;
  const array = extractInputRows(JSON.stringify([
    'https://cipherscan.app/blocks',
    { url: 'https://cipherscan.app/txs', label: 'transactions' },
  ]), { inputPath: 'urls.json' });
  const object = extractInputRows(JSON.stringify({
    schemaVersion: 1,
    urls: [{ url: 'https://cipherscan.app/rich-list', label: 'rich list' }],
  }), { inputPath: 'urls.json' });

  assert.equal(array.format, 'json');
  assert.deepEqual(array.rows.map((row) => row.url), [
    'https://cipherscan.app/blocks',
    'https://cipherscan.app/txs',
  ]);
  assert.equal(array.rows[1].label, 'transactions');
  assert.equal(object.rows[0].url, 'https://cipherscan.app/rich-list');
  assert.equal(object.rows[0].label, 'rich list');
});

test('extracts quoted CSV with BOM, CRLF, commas, and escaped quotes', async () => {
  const { decodeInput, extractInputRows } = await library;
  const csv = [
    '\uFEFFURL,label,notes',
    '"https://cipherscan.app/blocks","latest, blocks","say ""hello"""',
    'https://cipherscan.app/txs,transactions,plain',
    '',
  ].join('\r\n');
  const extracted = extractInputRows(decodeInput(Buffer.from(csv)), {
    inputPath: 'urls.csv',
    urlColumn: 'url',
  });

  assert.equal(extracted.format, 'csv');
  assert.deepEqual(extracted.rows.map((row) => row.url), [
    'https://cipherscan.app/blocks',
    'https://cipherscan.app/txs',
  ]);
  assert.equal(extracted.rows[0].label, 'latest, blocks');
  assert.throws(
    () => extractInputRows('path,label\n/blocks,blocks', {
      inputPath: 'bad.csv',
      urlColumn: 'url',
    }),
    /url column/i,
  );
});

test('accepts only absolute, same-origin, query-free page URLs', async () => {
  const { resolveWarmTargets } = await library;
  const rows = [
    { url: 'https://cipherscan.app/blocks', label: 'valid' },
    { url: '/txs', label: 'relative' },
    { url: 'http://cipherscan.app/blocks', label: 'scheme' },
    { url: 'https://testnet.cipherscan.app/blocks', label: 'subdomain' },
    { url: 'https://cipherscan.app:444/blocks', label: 'port' },
    { url: 'https://user:secret@cipherscan.app/blocks', label: 'credentials' },
    { url: 'https://cipherscan.app/blocks#top', label: 'fragment' },
    { url: 'https://cipherscan.app/blocks?cursor=1', label: 'query' },
    { url: 'ftp://cipherscan.app/blocks', label: 'protocol' },
    { url: 'https://cipherscan.app/api/blocks', label: 'api' },
    { url: 'https://cipherscan.app/_next/static/file.js', label: 'next' },
    { url: 'https://cipherscan.app/.netlify/functions/render', label: 'netlify' },
  ];
  const resolved = resolveWarmTargets(rows, {
    origin: 'https://cipherscan.app',
    maxUrls: 100,
  });

  assert.equal(resolved.origin, 'https://cipherscan.app');
  assert.deepEqual(resolved.targets.map((target) => target.url), [
    'https://cipherscan.app/blocks',
  ]);
  assert.equal(resolved.rejected.length, rows.length - 1);
  assert.throws(
    () => resolveWarmTargets(rows, { origin: 'file:///tmp/cipherscan' }),
    /HTTP\(S\)|origin/i,
  );
});

test('deduplicates normalized URLs and records duplicate input rows', async () => {
  const { resolveWarmTargets } = await library;
  const resolved = resolveWarmTargets([
    { url: 'https://CIPHERSCAN.app:443/blocks', label: 'first' },
    { url: 'https://cipherscan.app/blocks', label: 'duplicate' },
    { url: 'https://cipherscan.app/blocks/', label: 'trailing slash' },
  ], {
    origin: 'https://cipherscan.app',
    maxUrls: 10,
  });

  assert.deepEqual(resolved.targets.map((target) => target.url), [
    'https://cipherscan.app/blocks',
    'https://cipherscan.app/blocks/',
  ]);
  assert.equal(resolved.targets[0].label, 'first');
  assert.equal(resolved.duplicates.length, 1);
  assert.throws(() => resolveWarmTargets([
    { url: 'https://cipherscan.app/' },
    { url: 'https://cipherscan.app/blocks' },
  ], {
    origin: 'https://cipherscan.app',
    maxUrls: 1,
  }), /maximum|maxUrls/i);
});

test('drains a valid body to EOF without buffering the complete response', async () => {
  const { drainBody } = await library;
  const { response, state } = makeResponse({
    chunks: [Buffer.from('abc'), Buffer.from('defg')],
    headers: { 'content-length': '7' },
  });
  const result = await drainBody(response, 10);

  assert.equal(bodyBytes(result), 7);
  assert.equal(state.chunksRead, 2);
  assert.equal(state.cancelCalls, 0);
});

test('cancels bodies whose declared or streamed size exceeds the cap', async () => {
  const { drainBody } = await library;
  const declared = makeResponse({
    chunks: [Buffer.from('ignored')],
    headers: { 'content-length': '100' },
  });
  await assert.rejects(drainBody(declared.response, 10), (error) => error.code === 'BODY_LIMIT');
  assert.equal(declared.state.cancelCalls, 1);
  assert.equal(declared.state.chunksRead, 0);

  const streamed = makeResponse({
    chunks: [Buffer.from('12345'), Buffer.from('67890'), Buffer.from('x')],
  });
  await assert.rejects(drainBody(streamed.response, 10), (error) => error.code === 'BODY_LIMIT');
  assert.equal(streamed.response.body.locked, false);
  assert.equal(streamed.state.chunksRead, 3);
});

test('warmUrl uses a manual credential-free GET and fully drains eligible HTML', async () => {
  const { warmUrl } = await library;
  const { response, state } = makeResponse({
    chunks: [Buffer.from('warm'), Buffer.from(' body')],
    headers: {
      'cache-status': '"Netlify Edge"; fwd=miss',
      'set-cookie': 'session=must-not-be-recorded',
      'x-nf-request-id': 'request-1',
    },
  });
  let request;
  const observation = await warmUrl({ url: 'https://cipherscan.app/blocks' }, {
    fetchImpl: async (url, init) => {
      request = { url, init };
      return response;
    },
    maxBodyBytes: 100,
    signalFactory: () => undefined,
    wallNow: () => new Date('2026-07-16T00:00:00.000Z'),
  });

  assert.equal(request.url, 'https://cipherscan.app/blocks');
  assert.equal(request.init.method, 'GET');
  assert.equal(request.init.redirect, 'manual');
  assert.equal(request.init.credentials, 'omit');
  assert.equal(bodyComplete(observation), true);
  assert.equal(observation.body?.bytes ?? observation.bodyBytes, 9);
  assert.equal(state.chunksRead, 2);
  assert.equal(state.cancelCalls, 0);
  assert.equal(observation.headers['cache-status'], '"Netlify Edge"; fwd=miss');
  assert.equal(Object.hasOwn(observation.headers, 'set-cookie'), false);
  assertNoTtfbClaims(observation);
});

test('warmUrl cancels redirects and non-HTML responses without following or draining them', async () => {
  const { warmUrl } = await library;
  const redirect = makeResponse({
    status: 302,
    headers: { location: 'https://example.com/elsewhere' },
  });
  const nonHtml = makeResponse({ contentType: 'application/json' });
  const calls = [];
  const redirectObservation = await warmUrl({ url: 'https://cipherscan.app/old' }, {
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return redirect.response;
    },
    signalFactory: () => undefined,
  });
  const nonHtmlObservation = await warmUrl({ url: 'https://cipherscan.app/data' }, {
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return nonHtml.response;
    },
    signalFactory: () => undefined,
  });

  assert.equal(calls.length, 2);
  assert.ok(calls.every(({ init }) => init.redirect === 'manual'));
  assert.equal(bodyComplete(redirectObservation), false);
  assert.equal(bodyComplete(nonHtmlObservation), false);
  assert.equal(redirect.state.cancelCalls, 1);
  assert.equal(nonHtml.state.cancelCalls, 1);
  assert.equal(redirect.state.chunksRead, 0);
  assert.equal(nonHtml.state.chunksRead, 0);
  assert.equal(redirectObservation.headers.location, 'https://example.com/elsewhere');
});

test('createRateGate spaces every request start using the injected clock', async () => {
  const { createRateGate } = await library;
  let clock = 0;
  const sleeps = [];
  const gate = createRateGate({
    requestsPerSecond: 2,
    now: () => clock,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
      clock += milliseconds;
    },
  });
  const starts = [];
  for (let index = 0; index < 3; index += 1) {
    await gate();
    starts.push(clock);
  }

  assert.deepEqual(starts, [0, 500, 1_000]);
  assert.deepEqual(sleeps, [500, 500]);
  assert.throws(
    () => createRateGate({ requestsPerSecond: 0 }),
    /requestsPerSecond|positive/i,
  );
});

test('runWarmup bounds concurrency and preserves input order', async () => {
  const { runWarmup } = await library;
  const targets = Array.from({ length: 5 }, (_, index) => ({
    url: `https://cipherscan.app/block/${index + 1}`,
    path: `/block/${index + 1}`,
  }));
  let active = 0;
  let maximumActive = 0;
  const implementation = async (target) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return completeObservation(target);
  };
  const result = await runWarmup(targets, {
    concurrency: 2,
    maxFailures: 3,
    measureImpl: implementation,
    warmImpl: implementation,
    rateGate: async () => {},
  });

  assert.equal(maximumActive, 2);
  assert.equal(result.stoppedEarly, false);
  assert.equal(notAttemptedCount(result.notAttempted), 0);
  assert.deepEqual(result.observations.map((row) => row.requestedUrl), targets.map((row) => row.url));
  assert.deepEqual(result.observations.map((row) => row.sequence), [1, 2, 3, 4, 5]);
});

test('runWarmup stops scheduling after the failure cap', async () => {
  const { runWarmup } = await library;
  const targets = Array.from({ length: 5 }, (_, index) => ({
    url: `https://cipherscan.app/block/${index + 1}`,
    path: `/block/${index + 1}`,
  }));
  let calls = 0;
  const implementation = async (target) => {
    calls += 1;
    return completeObservation(target, {
      status: 500,
      ok: false,
      httpOk: false,
      eligible: false,
      bodyComplete: false,
      body: { disposition: 'cancelled', bytes: 0, complete: false, reason: 'http-status' },
    });
  };
  const result = await runWarmup(targets, {
    concurrency: 1,
    maxFailures: 2,
    measureImpl: implementation,
    warmImpl: implementation,
    rateGate: async () => {},
  });

  assert.equal(calls, 2);
  assert.equal(result.stoppedEarly, true);
  assert.match(result.stopReason, /failure/i);
  assert.equal(notAttemptedCount(result.notAttempted), 3);
  assert.equal(result.observations.length, 2);
});

test('runWarmup circuit-breaks immediately on HTTP 429 without retrying', async () => {
  const { runWarmup } = await library;
  const targets = Array.from({ length: 4 }, (_, index) => ({
    url: `https://cipherscan.app/block/${index + 1}`,
    path: `/block/${index + 1}`,
  }));
  let calls = 0;
  const implementation = async (target) => {
    calls += 1;
    return completeObservation(target, {
      status: 429,
      ok: false,
      httpOk: false,
      eligible: false,
      bodyComplete: false,
      body: { disposition: 'cancelled', bytes: 0, complete: false, reason: 'rate-limited' },
    });
  };
  const result = await runWarmup(targets, {
    concurrency: 1,
    maxFailures: 10,
    measureImpl: implementation,
    warmImpl: implementation,
    rateGate: async () => {},
  });

  assert.equal(calls, 1);
  assert.equal(result.stoppedEarly, true);
  assert.match(result.stopReason, /429|rate/i);
  assert.equal(notAttemptedCount(result.notAttempted), 3);
});

test('summarizeWarmup reports operations and cache observations without TTFB claims', async () => {
  const { summarizeWarmup } = await library;
  const runResult = {
    observations: [
      completeObservation({ url: 'https://cipherscan.app/blocks' }, {
        status: 200,
        cache: {
          netlify: {
            edge: { state: 'HIT' },
            durable: { state: 'UNKNOWN' },
          },
          application: 'UNKNOWN',
          vercel: 'UNKNOWN',
        },
      }),
      completeObservation({ url: 'https://cipherscan.app/txs' }, {
        status: 500,
        ok: false,
        httpOk: false,
        eligible: false,
        bodyComplete: false,
        body: { disposition: 'cancelled', bytes: 0, complete: false, reason: 'http-status' },
      }),
    ],
    stoppedEarly: true,
    stopReason: 'max-failures',
    notAttempted: 2,
  };
  const summary = summarizeWarmup(runResult);
  const attempted = summary.attemptedRequests ?? summary.attempted;
  const errors = summary.operationalErrors ?? summary.failed;
  const skipped = summary.notAttempted ?? summary.skippedUrls;

  assert.equal(attempted, 2);
  assert.equal(errors, 1);
  assert.equal(skipped, 2);
  assert.equal(Object.hasOwn(summary, 'warmed'), false);
  assert.equal(Object.hasOwn(summary, 'passed'), false);
  assertNoTtfbClaims({ summary, observations: runResult.observations });
});

test('CLI dry run writes a plan artifact without invoking injected fetch', async () => {
  const { main } = await cli;
  const fixture = await cliFixture();
  let fetchCalls = 0;

  try {
    await withCliState(async () => {
      const artifact = await main([
        '--origin=https://cipherscan.app',
        `--input=${fixture.input}`,
        `--output=${fixture.output}`,
      ], {
        fetchImpl: async () => {
          fetchCalls += 1;
          throw new Error('dry run must not fetch');
        },
        wallNow: () => new Date('2026-07-16T01:00:00.000Z'),
      });

      assert.equal(process.exitCode, undefined);
      assert.equal(fetchCalls, 0);
      assert.equal(artifact.metadata.mode, 'dry-run');
      assert.equal(artifact.summary.attemptedRequests, 0);
      assert.equal(artifact.summary.notAttempted, 1);
      assert.equal(artifact.results.length, 1);
      assert.equal(artifact.results[0].operation, null);

      const written = JSON.parse(await readFile(fixture.output, 'utf8'));
      assert.equal(written.metadata.mode, 'dry-run');
      assert.equal(written.results[0].url, 'https://cipherscan.app/blocks');
      assertNoTtfbClaims(written);
    });
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});

test('CLI rejects unconfirmed or mismatched execution before fetch or output', async () => {
  const { main } = await cli;
  const fixture = await cliFixture();
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    throw new Error('unsafe execution must not fetch');
  };

  try {
    await withCliState(async ({ errors }) => {
      const missingConfirmation = await main([
        '--origin=https://cipherscan.app',
        `--input=${fixture.input}`,
        `--output=${fixture.output}`,
        '--execute',
      ], { fetchImpl });

      assert.equal(missingConfirmation, null);
      assert.equal(process.exitCode, 2);
      assert.equal(fetchCalls, 0);
      assert.match(errors.join('\n'), /confirm-origin is required/i);
      await assert.rejects(access(fixture.output), (error) => error.code === 'ENOENT');

      process.exitCode = undefined;
      errors.length = 0;
      const mismatchedConfirmation = await main([
        '--origin=https://cipherscan.app',
        '--confirm-origin=https://testnet.cipherscan.app',
        `--input=${fixture.input}`,
        `--output=${fixture.output}`,
        '--execute',
      ], { fetchImpl });

      assert.equal(mismatchedConfirmation, null);
      assert.equal(process.exitCode, 2);
      assert.equal(fetchCalls, 0);
      assert.match(errors.join('\n'), /confirm-origin must exactly match/i);
      await assert.rejects(access(fixture.output), (error) => error.code === 'ENOENT');
    });
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});

test('CLI confirmed execution uses injected fetch and emits no performance fields', async () => {
  const { main } = await cli;
  const fixture = await cliFixture();
  const body = makeResponse({
    chunks: [Buffer.from('<html>'), Buffer.from('</html>')],
    headers: {
      'cache-status': '"Netlify Edge"; fwd=miss',
      'x-nf-request-id': 'cli-request-1',
    },
  });
  const requests = [];

  try {
    await withCliState(async () => {
      const artifact = await main([
        '--origin=https://cipherscan.app',
        '--confirm-origin=https://cipherscan.app',
        `--input=${fixture.input}`,
        `--output=${fixture.output}`,
        '--execute',
        '--concurrency=1',
        '--requests-per-second=1',
        '--timeout-ms=1000',
        '--max-body-bytes=1024',
        '--max-failures=1',
      ], {
        fetchImpl: async (url, init) => {
          requests.push({ init, url });
          return body.response;
        },
        wallNow: () => new Date('2026-07-16T01:00:00.000Z'),
      });

      assert.equal(process.exitCode, undefined);
      assert.equal(requests.length, 1);
      assert.equal(requests[0].url, 'https://cipherscan.app/blocks');
      assert.equal(requests[0].init.method, 'GET');
      assert.equal(requests[0].init.redirect, 'manual');
      assert.equal(requests[0].init.credentials, 'omit');
      assert.equal(body.state.chunksRead, 2);
      assert.equal(body.state.cancelCalls, 0);
      assert.equal(artifact.metadata.mode, 'execute');
      assert.equal(artifact.summary.attemptedRequests, 1);
      assert.equal(artifact.summary.operationalErrors, 0);
      assert.equal(artifact.results[0].operation.body.complete, true);

      const written = JSON.parse(await readFile(fixture.output, 'utf8'));
      assert.equal(written.metadata.mode, 'execute');
      assert.equal(written.results[0].operation.headers['cache-status'], '"Netlify Edge"; fwd=miss');
      assertNoTtfbClaims(written);
    });
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});
