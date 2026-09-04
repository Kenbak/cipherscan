const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const test = require('node:test');
const { EventEmitter } = require('node:events');

/**
 * Loads zebra-grpc.js with `@grpc/grpc-js` and `@grpc/proto-loader`
 * replaced by test doubles, so these tests never touch a real proto file
 * or network socket. Mirrors the `loadJavaScriptModule` pattern already
 * used by server/tests/sitemap-security.test.js.
 */
function loadZebraGrpcModule(imports) {
  const filename = path.join(__dirname, '..', 'zebra-grpc.js');
  const source = fs.readFileSync(filename, 'utf8');
  const moduleObj = { exports: {} };
  const localRequire = (specifier) => {
    if (Object.prototype.hasOwnProperty.call(imports, specifier)) return imports[specifier];
    if (specifier === './lib/safe-log') {
      return { logSafeError: () => {}, logSafeWarn: () => {} };
    }
    return require(specifier);
  };
  const evaluate = new Function('exports', 'require', 'module', '__filename', '__dirname', source);
  evaluate(moduleObj.exports, localRequire, moduleObj, filename, path.dirname(filename));
  return moduleObj.exports;
}

class FakeStream extends EventEmitter {
  constructor() {
    super();
    this.cancelled = false;
  }
  cancel() {
    this.cancelled = true;
  }
}

/** Fake IndexerService client: records created streams by RPC name for tests to drive manually. */
function createFakeIndexerClient() {
  const streamsByRpc = { MempoolChange: [], ChainTipChange: [] };
  class FakeIndexerClient {
    constructor(url, creds, options) {
      this.url = url;
      this.creds = creds;
      this.options = options;
    }
    MempoolChange() {
      const stream = new FakeStream();
      streamsByRpc.MempoolChange.push(stream);
      return stream;
    }
    ChainTipChange() {
      const stream = new FakeStream();
      streamsByRpc.ChainTipChange.push(stream);
      return stream;
    }
  }
  return { FakeIndexerClient, streamsByRpc };
}

function fakeGrpcModule() {
  return {
    status: { CANCELLED: 1 },
    credentials: { createInsecure: () => 'insecure-creds' },
    loadPackageDefinition: (def) => def,
    closeClient: () => {},
  };
}

function fakeProtoLoaderModule(IndexerClient) {
  return {
    loadSync: () => ({
      zebra: { indexer: { rpc: { Indexer: IndexerClient } } },
    }),
  };
}

/** Manual timer controller: captures scheduled callbacks instead of using real timers. */
function manualTimers() {
  let now = 0;
  const timeouts = new Map();
  const intervals = new Map();
  let nextId = 1;
  return {
    now: () => now,
    setTimeoutFn(fn, ms) {
      const id = nextId++;
      timeouts.set(id, { fn, ms, dueAt: now + ms });
      return id;
    },
    clearTimeoutFn(id) {
      timeouts.delete(id);
    },
    setIntervalFn(fn, ms) {
      const id = nextId++;
      intervals.set(id, { fn, ms, dueAt: now + ms });
      return id;
    },
    clearIntervalFn(id) {
      intervals.delete(id);
    },
    /** Advances the clock and fires any due timeouts/intervals (intervals reschedule). */
    advance(ms) {
      now += ms;
      for (const [id, entry] of [...timeouts]) {
        if (entry.dueAt <= now) {
          timeouts.delete(id);
          entry.fn();
        }
      }
      for (const entry of intervals.values()) {
        while (entry.dueAt <= now) {
          entry.dueAt += entry.ms;
          entry.fn();
        }
      }
    },
  };
}

test('StreamSupervisor reconnects independently per stream with exponential backoff + jitter', () => {
  const { StreamSupervisor } = loadZebraGrpcModule({
    '@grpc/grpc-js': fakeGrpcModule(),
    '@grpc/proto-loader': fakeProtoLoaderModule(class {}),
  });

  const timers = manualTimers();
  const opened = [];
  const connectionEvents = [];
  const supervisor = new StreamSupervisor({
    name: 'test-stream',
    openStream: () => {
      const stream = new FakeStream();
      opened.push(stream);
      return stream;
    },
    onData: () => {},
    onConnectionChange: (connected) => connectionEvents.push(connected),
    staleAfterMs: 999_999, // not under test here
    now: timers.now,
    random: () => 0, // pin jitter to the low end (50% of the computed delay)
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
    setIntervalFn: timers.setIntervalFn,
    clearIntervalFn: timers.clearIntervalFn,
  });

  supervisor.start();
  assert.equal(opened.length, 1);
  assert.equal(supervisor.connected, false);

  opened[0].emit('data', { ok: true });
  assert.equal(supervisor.connected, true);
  assert.deepEqual(connectionEvents, [true]);

  // First failure: reconnect delay starts at 3000ms, jitter pinned to 50% -> 1500ms.
  opened[0].emit('error', new Error('stream broke'));
  assert.equal(supervisor.connected, false);
  assert.deepEqual(connectionEvents, [true, false]);
  assert.equal(opened.length, 1, 'must not reconnect before the backoff delay elapses');

  timers.advance(1500);
  assert.equal(opened.length, 2, 'reconnects after the jittered delay');

  // Second consecutive failure without a successful data event doubles the
  // base delay: 3000 -> 6000, jittered to 3000.
  opened[1].emit('error', new Error('still broken'));
  timers.advance(2999);
  assert.equal(opened.length, 2, 'must not reconnect early');
  timers.advance(1);
  assert.equal(opened.length, 3);

  // A successful data event resets the backoff back to the initial delay.
  opened[2].emit('data', { ok: true });
  opened[2].emit('error', new Error('broke again'));
  timers.advance(1500);
  assert.equal(opened.length, 4, 'backoff resets to the initial delay after a successful connection');
});

test('StreamSupervisor ignores CANCELLED errors (expected on our own .cancel())', () => {
  const { StreamSupervisor } = loadZebraGrpcModule({
    '@grpc/grpc-js': fakeGrpcModule(),
    '@grpc/proto-loader': fakeProtoLoaderModule(class {}),
  });
  const timers = manualTimers();
  const opened = [];
  const supervisor = new StreamSupervisor({
    name: 'test-stream',
    openStream: () => {
      const s = new FakeStream();
      opened.push(s);
      return s;
    },
    onData: () => {},
    staleAfterMs: 999_999,
    now: timers.now,
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
    setIntervalFn: timers.setIntervalFn,
    clearIntervalFn: timers.clearIntervalFn,
  });

  supervisor.start();
  const cancelledError = new Error('Call cancelled');
  cancelledError.code = 1; // matches fakeGrpcModule's status.CANCELLED
  opened[0].emit('error', cancelledError);

  timers.advance(60_000);
  assert.equal(opened.length, 1, 'a CANCELLED error (our own .cancel()) must not trigger a reconnect');
});

test('StreamSupervisor staleness watchdog forces a reconnect when a connected stream stops delivering data', () => {
  const { StreamSupervisor } = loadZebraGrpcModule({
    '@grpc/grpc-js': fakeGrpcModule(),
    '@grpc/proto-loader': fakeProtoLoaderModule(class {}),
  });
  const timers = manualTimers();
  const opened = [];
  const connectionEvents = [];
  const supervisor = new StreamSupervisor({
    name: 'chain-tip',
    openStream: () => {
      const s = new FakeStream();
      opened.push(s);
      return s;
    },
    onData: () => {},
    onConnectionChange: (connected) => connectionEvents.push(connected),
    staleAfterMs: 1000,
    staleCheckIntervalMs: 100,
    now: timers.now,
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
    setIntervalFn: timers.setIntervalFn,
    clearIntervalFn: timers.clearIntervalFn,
  });

  supervisor.start();
  opened[0].emit('data', {});
  assert.equal(supervisor.connected, true);

  // Idle for less than the stale threshold: still connected, no reconnect.
  timers.advance(900);
  assert.equal(supervisor.connected, true);
  assert.equal(opened.length, 1);

  // Idle past the stale threshold: the watchdog force-reconnects even
  // though the stream never emitted 'error' or 'end'.
  timers.advance(200);
  assert.equal(supervisor.connected, false);
  assert.equal(opened[0].cancelled, true, 'the stale stream is explicitly cancelled');
  assert.equal(opened.length, 2, 'a fresh stream is opened immediately (reconnect delay reset to initial)');
  assert.deepEqual(connectionEvents, [true, false]);
});

test('StreamSupervisor.stop() tears down timers and the stream without reconnecting', () => {
  const { StreamSupervisor } = loadZebraGrpcModule({
    '@grpc/grpc-js': fakeGrpcModule(),
    '@grpc/proto-loader': fakeProtoLoaderModule(class {}),
  });
  const timers = manualTimers();
  const opened = [];
  const supervisor = new StreamSupervisor({
    name: 'mempool',
    openStream: () => {
      const s = new FakeStream();
      opened.push(s);
      return s;
    },
    onData: () => {},
    staleAfterMs: 100,
    staleCheckIntervalMs: 50,
    now: timers.now,
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
    setIntervalFn: timers.setIntervalFn,
    clearIntervalFn: timers.clearIntervalFn,
  });

  supervisor.start();
  opened[0].emit('data', {});
  supervisor.stop();
  assert.equal(opened[0].cancelled, true);

  opened[0].emit('error', new Error('irrelevant after stop'));
  timers.advance(10_000);
  assert.equal(opened.length, 1, 'must not reconnect once stopped');
});

test('ZebraGrpcClient supervises mempool and chain-tip independently — a dead chain-tip stream does not report as connected via mempool', () => {
  const { FakeIndexerClient, streamsByRpc } = createFakeIndexerClient();
  const { ZebraGrpcClient } = loadZebraGrpcModule({
    '@grpc/grpc-js': fakeGrpcModule(),
    '@grpc/proto-loader': fakeProtoLoaderModule(FakeIndexerClient),
  });

  const mempoolEvents = [];
  const chainTipEvents = [];
  const connectionChanges = [];
  const client = new ZebraGrpcClient('127.0.0.1:8230', {
    onMempoolChange: (change) => mempoolEvents.push(change),
    onChainTipChange: (tip) => chainTipEvents.push(tip),
    onConnectionChange: (connected, detail) => connectionChanges.push({ connected, detail }),
  });

  client.start();
  assert.equal(streamsByRpc.MempoolChange.length, 1);
  assert.equal(streamsByRpc.ChainTipChange.length, 1);
  assert.deepEqual(client.getStatus(), { mempool: false, chainTip: false });

  // Mempool comes up; chain-tip never does (simulates the exact P0 bug:
  // previously the chain-tip stream had no reconnect logic at all, so a
  // dead chain-tip stream could leave the combined "connected" flag stuck
  // true forever as long as mempool kept working).
  const mempoolTxHash = Buffer.from('ab', 'hex');
  streamsByRpc.MempoolChange[0].emit('data', { changeType: 'ADDED', txHash: mempoolTxHash });

  assert.equal(client.getStatus().mempool, true);
  assert.equal(client.getStatus().chainTip, false);
  assert.equal(client.isConnected(), false, 'overall connected must require BOTH streams');
  assert.equal(mempoolEvents.length, 1);
  assert.equal(mempoolEvents[0].txid, 'ab');
  assert.equal(chainTipEvents.length, 0);

  // Chain-tip stream now also delivers data.
  const blockHash = Buffer.from('cd', 'hex');
  streamsByRpc.ChainTipChange[0].emit('data', { height: 123, hash: blockHash });
  assert.equal(client.getStatus().chainTip, true);
  assert.equal(client.isConnected(), true);
  assert.equal(chainTipEvents.length, 1);
  assert.deepEqual(chainTipEvents[0], { height: 123, hash: 'cd' });

  // onConnectionChange was called at least once for each transition, and
  // always reflects the combined boolean the caller relies on.
  assert.ok(connectionChanges.some((e) => e.connected === false));
  assert.ok(connectionChanges.some((e) => e.connected === true));
  assert.deepEqual(connectionChanges.at(-1), { connected: true, detail: { mempool: true, chainTip: true } });

  client.stop();
  assert.equal(streamsByRpc.MempoolChange[0].cancelled, true);
  assert.equal(streamsByRpc.ChainTipChange[0].cancelled, true);
});

test('ZebraGrpcClient.start() is a no-op (polling fallback only) when no gRPC URL is configured', () => {
  const { FakeIndexerClient, streamsByRpc } = createFakeIndexerClient();
  const { ZebraGrpcClient } = loadZebraGrpcModule({
    '@grpc/grpc-js': fakeGrpcModule(),
    '@grpc/proto-loader': fakeProtoLoaderModule(FakeIndexerClient),
  });

  const client = new ZebraGrpcClient(null, {
    onMempoolChange: () => {},
    onChainTipChange: () => {},
  });
  client.start();

  assert.equal(streamsByRpc.MempoolChange.length, 0);
  assert.equal(streamsByRpc.ChainTipChange.length, 0);
  assert.deepEqual(client.getStatus(), { mempool: false, chainTip: false });
});
