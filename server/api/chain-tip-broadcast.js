'use strict';

/**
 * Chain-tip broadcast supervisor.
 *
 * Zebra's gRPC ChainTipChange stream fires the instant a new block is
 * accepted by the node — but cipherscan-rust still has to index it into
 * PostgreSQL before the full row (transaction_count, miner_address, fees,
 * etc.) exists. The previous implementation waited a single fixed 500ms
 * and then queried once: under indexer load that broadcasts an
 * incomplete/placeholder block forever (nothing ever corrects it), and
 * when the indexer is fast it wastes up to 500ms of latency waiting on a
 * row that was already committed.
 *
 * This module bounds that PRIMARY (write pool) commit-polling window,
 * broadcasts the best available data as soon as it's known, and — only if
 * the indexer hasn't caught up within the initial bounded wait —
 * schedules a single, separately-bounded background poll to self-correct
 * with the complete row once it lands. The self-correction is skipped if a
 * newer or different tip (next block, or a reorg at the same height) has
 * already superseded the height it was polling for.
 *
 * Callers must pass a query function bound to the PRIMARY/write pool, not
 * a read replica — the replica can lag behind the primary by design (see
 * pool-routing.js), which would make this polling loop wait on data that
 * already exists on the primary.
 */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const DEFAULTS = {
  initialPollIntervalMs: 150,
  initialMaxWaitMs: 2_000,
  selfCorrectPollIntervalMs: 500,
  selfCorrectMaxWaitMs: 15_000,
};

/**
 * @param {object} options
 * @param {(height: number) => Promise<object|null>} options.queryBlockByHeight
 *   Looks up the full block row on the PRIMARY (write) pool for `height`.
 *   Must resolve to `null` for "not found yet" — let real query errors
 *   reject so the poller can log/retry within its bounded window instead
 *   of silently treating a DB outage as "not indexed yet".
 * @param {(block: object) => void} options.broadcast - Broadcasts a block (partial or full row).
 * @param {() => { height: number, hash: string }} options.getChainTip
 *   Returns the currently-known canonical tip, used to avoid re-broadcasting
 *   a self-correction for a height that a reorg or newer block has already
 *   superseded.
 * @param {(ms: number) => Promise<void>} [options.sleepFn]
 * @param {() => number} [options.now] - Clock used for the poll deadline; must
 *   advance consistently with `sleepFn` for bounded-wait tests to be deterministic.
 * @param {(context: string, error: Error) => void} [options.onError]
 *   Called instead of throwing when a poll iteration's query rejects.
 */
function createChainTipBroadcaster({
  queryBlockByHeight,
  broadcast,
  getChainTip,
  sleepFn = sleep,
  now = () => Date.now(),
  onError = () => {},
  initialPollIntervalMs = DEFAULTS.initialPollIntervalMs,
  initialMaxWaitMs = DEFAULTS.initialMaxWaitMs,
  selfCorrectPollIntervalMs = DEFAULTS.selfCorrectPollIntervalMs,
  selfCorrectMaxWaitMs = DEFAULTS.selfCorrectMaxWaitMs,
} = {}) {
  if (typeof queryBlockByHeight !== 'function') {
    throw new TypeError('queryBlockByHeight is required');
  }
  if (typeof broadcast !== 'function') throw new TypeError('broadcast is required');
  if (typeof getChainTip !== 'function') throw new TypeError('getChainTip is required');

  // Heights currently being self-corrected in the background, so a slow
  // indexer (or a burst of ChainTipChange events) can't spawn duplicate
  // pollers for the same height.
  const pendingSelfCorrections = new Set();

  async function pollForBlock(height, { pollIntervalMs, maxWaitMs }) {
    const deadline = now() + maxWaitMs;
    for (;;) {
      try {
        const row = await queryBlockByHeight(height);
        if (row) return row;
      } catch (err) {
        onError('poll', err);
      }
      if (now() >= deadline) return null;
      await sleepFn(pollIntervalMs);
    }
  }

  function isStillCurrentTip(height, hash) {
    const tip = getChainTip();
    return tip && tip.height === height && tip.hash === hash;
  }

  function scheduleSelfCorrection(height, hash) {
    if (pendingSelfCorrections.has(height)) return;
    pendingSelfCorrections.add(height);
    Promise.resolve()
      .then(async () => {
        const corrected = await pollForBlock(height, {
          pollIntervalMs: selfCorrectPollIntervalMs,
          maxWaitMs: selfCorrectMaxWaitMs,
        });
        if (corrected && isStillCurrentTip(height, hash)) {
          broadcast(corrected);
        }
      })
      .catch((err) => onError('self-correct', err))
      .finally(() => pendingSelfCorrections.delete(height));
  }

  async function handleChainTipChange(tip) {
    const height = Number(tip.height);
    const hash = tip.hash;

    const fullBlock = await pollForBlock(height, {
      pollIntervalMs: initialPollIntervalMs,
      maxWaitMs: initialMaxWaitMs,
    });

    if (fullBlock) {
      broadcast(fullBlock);
      return;
    }

    // Indexer hasn't committed the row within the bounded initial wait —
    // broadcast what Zebra told us right now (clients still see the new
    // tip immediately) and self-correct with the full row once it's
    // available, bounded so a stuck indexer can't accumulate unbounded
    // background pollers.
    broadcast({ height, hash });
    scheduleSelfCorrection(height, hash);
  }

  return {
    handleChainTipChange,
    // Exposed for tests/observability only — not relied on by callers.
    _pendingSelfCorrectionCount: () => pendingSelfCorrections.size,
  };
}

module.exports = { createChainTipBroadcaster, DEFAULTS };
