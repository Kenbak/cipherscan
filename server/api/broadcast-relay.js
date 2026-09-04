'use strict';

const { randomUUID } = require('crypto');

/**
 * Redis pub/sub broadcast relay — de-duplicates the self-echo that occurs
 * because every API instance (including the one that just published) is
 * also subscribed to the same `zcash:broadcast` channel. Without this, the
 * publishing instance delivers each event to its local WebSocket clients
 * twice: once synchronously in-process, and once again when its own
 * publish comes back through its Redis subscription.
 *
 * Each outbound broadcast is wrapped with the publishing instance's ID and
 * a random message ID before it goes over Redis. On receipt, a message is
 * only (re)delivered locally if it did NOT originate from this instance
 * (instance-ID check) and has not already been processed (message-ID
 * check, defensive against redelivery). Locally-originated messages are
 * still delivered to local WebSocket clients synchronously by the caller,
 * never round-tripped through Redis first — this module only governs
 * whether an *inbound* Redis message should be (re)delivered locally.
 *
 * Service-only fields (e.g. `raw_hex` for CipherPay's `raw_mempool`
 * subscription) are intentionally never part of the Redis envelope — they
 * stay local to whichever single instance actually received the
 * underlying gRPC mempool event, exactly as before this change (see
 * wiki decision 003-ws-mempool-push). Callers must publish only the
 * regular/public payload through `wrapEnvelope`, never `serviceExtra`.
 */

const DEFAULT_MAX_SEEN_MESSAGE_IDS = 2_000;

function createInstanceId() {
  return randomUUID();
}

function wrapEnvelope(instanceId, body) {
  return JSON.stringify({ instanceId, msgId: randomUUID(), body });
}

function parseEnvelope(raw) {
  let envelope;
  try {
    envelope = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!envelope || typeof envelope !== 'object') return null;
  if (typeof envelope.instanceId !== 'string' || !envelope.instanceId) return null;
  if (typeof envelope.msgId !== 'string' || !envelope.msgId) return null;
  if (!Object.prototype.hasOwnProperty.call(envelope, 'body')) return null;
  return envelope;
}

/**
 * Bounded FIFO set of recently-seen message IDs. Guards against duplicate
 * redelivery without growing without bound — the oldest IDs are evicted
 * once the cap is reached.
 */
function createSeenMessageTracker(maxSize = DEFAULT_MAX_SEEN_MESSAGE_IDS) {
  if (!Number.isInteger(maxSize) || maxSize < 1) {
    throw new RangeError('maxSize must be a positive integer');
  }
  const seen = new Set();
  return {
    hasSeen(msgId) {
      return seen.has(msgId);
    },
    markSeen(msgId) {
      if (seen.has(msgId)) return;
      seen.add(msgId);
      if (seen.size > maxSize) {
        const oldest = seen.values().next().value;
        seen.delete(oldest);
      }
    },
    size() {
      return seen.size;
    },
  };
}

/**
 * Decides whether an inbound Redis broadcast message should be delivered
 * to this instance's local WebSocket clients.
 *
 * Returns the parsed `body` to deliver, or `null` if the message should be
 * dropped (self-echo, already-seen duplicate, or malformed envelope).
 */
function receiveEnvelope({ raw, ownInstanceId, tracker }) {
  const envelope = parseEnvelope(raw);
  if (!envelope) return null;
  if (envelope.instanceId === ownInstanceId) return null; // self-echo — already delivered locally
  if (tracker.hasSeen(envelope.msgId)) return null;
  tracker.markSeen(envelope.msgId);
  return envelope.body;
}

module.exports = {
  createInstanceId,
  wrapEnvelope,
  parseEnvelope,
  createSeenMessageTracker,
  receiveEnvelope,
  DEFAULT_MAX_SEEN_MESSAGE_IDS,
};
