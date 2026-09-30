'use strict';
const { z } = require('zod');
const { createHash } = require('node:crypto');
const txidSchema = z.string().regex(/^[a-fA-F0-9]{64}$/);
const transactionQuerySchema = z.object({ mode: z.enum(['latest', 'detail']), txid: txidSchema.nullable(), limit: z.number().int().min(1).max(10) }).strict();
function resolveTransactionQuery(input) {
  const q = input.question.trim().replace(/[?.!]+$/, '');
  if (/^explain this (page|view)$/i.test(q) && !input.context) {
    if (input.page === 'transaction' && input.transaction) return { mode: 'detail', txid: input.transaction, limit: 1 };
    if (input.page === 'transactions') return { mode: 'latest', txid: null, limit: 5 };
  }
  if (/^(?:explain|describe|tell me about) this (?:transaction|tx)$/i.test(q) && input.transaction) return { mode: 'detail', txid: input.transaction, limit: 1 };
  const detail = q.match(/^(?:(?:show|explain|describe|give)(?: me)?|tell me about|what is|what's)?\s*(?:(?:zcash )?(?:transaction|tx)\s+)?([a-fA-F0-9]{64})$/i);
  if (detail) return { mode: 'detail', txid: detail[1].toLowerCase(), limit: 1 };
  const latest = q.match(/^(?:(?:show|explain|describe|give)(?: me)?|tell me about|what (?:is|are)|what's)?\s*(?:the )?(?:latest|newest|most recent) (?:([1-9]|10) )?(?:zcash )?(transactions?|txs?)$/i);
  if (latest) return { mode: 'latest', txid: null, limit: latest[1] ? Number(latest[1]) : /(?:transactions|txs)$/i.test(latest[2]) ? 5 : 1 };
  return null;
}
function integer(value, max = Number.MAX_SAFE_INTEGER) {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+$/.test(value))) throw new Error('Invalid transaction integer');
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0 || n > max) throw new Error('Invalid transaction integer');
  return n;
}
function optionalInt(value, max) { return value == null ? null : integer(value, max); }
function fee(value) {
  if (value == null) return null;
  if (!/^\d{1,24}$/.test(String(value)) || typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('Invalid transaction fee');
  return String(value);
}
function zec(value) {
  if (value === null) return 'Unavailable';
  const n = BigInt(value); return `${n / 100000000n}.${(n % 100000000n).toString().padStart(8, '0')} ZEC`;
}
function row(raw, kind) {
  if (kind === 'pending') raw = { ...raw, hasSapling: raw.saplingSpendCount > 0 || raw.saplingOutputCount > 0 ? true : undefined, hasOrchard: raw.orchardActions > 0 ? true : undefined };
  const txid = txidSchema.parse(raw.txid).toLowerCase();
  const list = kind === 'list', pending = kind === 'pending';
  if (!list && !pending && !['confirmed', 'stale', 'unknown'].includes(raw.status)) throw new Error('Invalid transaction status');
  if (!list && !pending && ((raw.status === 'confirmed') !== (raw.isCanonical === true))) throw new Error('Inconsistent transaction status');
  const pools = ['sprout', 'sapling', 'orchard', 'ironwood'].filter(pool => raw[list ? `has_${pool}` : `has${pool[0].toUpperCase()}${pool.slice(1)}`] === true).map(pool => pool[0].toUpperCase() + pool.slice(1));
  const flagsComplete = ['sprout', 'sapling', 'orchard', 'ironwood'].every(pool => typeof raw[list ? `has_${pool}` : `has${pool[0].toUpperCase()}${pool.slice(1)}`] === 'boolean');
  const blockHash = pending ? null : raw[list ? 'block_hash' : 'blockHash'] ?? null;
  if (blockHash !== null && !txidSchema.safeParse(blockHash).success) throw new Error('Invalid transaction block hash');
  const status = pending ? 'pending' : list ? 'indexed' : raw.status;
  const confirmations = list || pending ? null : optionalInt(raw.confirmations);
  if (status === 'confirmed' && (!blockHash || !confirmations)) throw new Error('Missing confirmation evidence');
  return { txid, status, blockHeight: pending ? null : optionalInt(raw[list ? 'block_height' : 'blockHeight'], 999999999), blockHash,
    timestamp: pending ? null : optionalInt(raw[list ? 'block_time' : 'blockTime'], 253402300799), confirmations,
    size: optionalInt(raw.size, 2000000), feeZat: pending ? null : fee(raw[list ? 'fee' : 'feeZat']),
    coinbase: pending ? false : typeof raw[list ? 'is_coinbase' : 'isCoinbase'] === 'boolean' ? raw[list ? 'is_coinbase' : 'isCoinbase'] : null,
    pools, componentsKnown: flagsComplete, transparentInputs: optionalInt(raw[list ? 'vin_count' : 'vinCount']), transparentOutputs: optionalInt(raw[list ? 'vout_count' : 'voutCount']),
  };
}
async function loadTransactions(query, client, signal) {
  query = transactionQuerySchema.parse(query);
  if (query.mode === 'detail' ? !query.txid || query.limit !== 1 : query.txid !== null) throw new Error('Invalid transaction query');
  let rows;
  if (query.mode === 'latest') {
    const response = await client.dispatch('GET', '/api/transactions/list', { query: { limit: String(query.limit) }, parentSignal: signal });
    if (!response.ok || response.body?.success !== true || !Array.isArray(response.body.transactions) || response.body.transactions.length > query.limit) throw new Error('Transaction source unavailable');
    const rawRows = response.body.transactions;
    rows = rawRows.map(raw => row(raw, 'list'));
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].blockHeight === null) throw new Error('Missing transaction height');
      const index = integer(rawRows[i].tx_index);
      if (i && (rows[i].blockHeight > rows[i - 1].blockHeight || rows[i].blockHeight === rows[i - 1].blockHeight && index >= integer(rawRows[i - 1].tx_index))) throw new Error('Invalid transaction ordering');
    }
    if (new Set(rows.map(tx => tx.txid)).size !== rows.length) throw new Error('Duplicate transaction');
  } else {
    const txid = query.txid.toLowerCase();
    const response = await client.dispatch('GET', `/api/seo/tx/${txid}`, { parentSignal: signal });
    if (response.status === 404) {
      const pending = await client.dispatch('GET', `/api/mempool/tx/${txid}`, { parentSignal: signal });
      if (!pending.ok || pending.body?.success !== true || typeof pending.body.inMempool !== 'boolean') throw new Error('Mempool source unavailable');
      rows = pending.body.inMempool ? [row(pending.body.transaction, 'pending')] : [];
    } else {
      if (!response.ok) throw new Error('Transaction source unavailable');
      rows = [row(response.body, 'detail')];
    }
    if (rows.some(tx => tx.txid !== txid)) throw new Error('Transaction identifier mismatch');
  }
  const retrievedAt = new Date().toISOString();
  const times = rows.map(tx => tx.timestamp).filter(time => time !== null);
  const facts = { result_count: String(rows.length) };
  rows.forEach((tx, index) => {
    const prefix = `tx_${String.fromCharCode(97 + index)}`;
    Object.assign(facts, { [`${prefix}_id`]: tx.txid, [`${prefix}_status`]: tx.status, [`${prefix}_block`]: tx.blockHeight === null ? 'Not available' : String(tx.blockHeight), [`${prefix}_time`]: tx.timestamp === null ? 'Not available' : new Date(tx.timestamp * 1000).toISOString(), [`${prefix}_confirmations`]: tx.confirmations === null ? 'Not available' : String(tx.confirmations), [`${prefix}_fee`]: zec(tx.feeZat), [`${prefix}_size`]: tx.size === null ? 'Not available' : `${tx.size} bytes`, [`${prefix}_components`]: tx.pools.length ? tx.pools.join(', ') : tx.componentsKnown ? 'No shielded components' : 'Shielded component details unavailable', [`${prefix}_coinbase`]: tx.coinbase === null ? 'Not available' : tx.coinbase ? 'Coinbase (mining reward)' : 'Not coinbase', [`${prefix}_inputs`]: tx.transparentInputs === null ? 'Not available' : String(tx.transparentInputs), [`${prefix}_outputs`]: tx.transparentOutputs === null ? 'Not available' : String(tx.transparentOutputs) });
  });
  return { status: rows.length ? 'found' : 'not-found', query, rows, retrievedAt, facts,
    evidenceKey: createHash('sha256').update(JSON.stringify([query, rows])).digest('hex'),
    dataContext: { start: times.length ? new Date(Math.min(...times) * 1000).toISOString() : null, end: times.length ? new Date(Math.max(...times) * 1000).toISOString() : null, retrievedAt, source: query.mode === 'latest' ? '/txs' : `/tx/${query.txid.toLowerCase()}`, label: query.mode === 'latest' ? 'Latest indexed transactions · unfiltered' : 'Transaction record' },
    input: { facts, scope: query.mode === 'latest' ? 'Latest indexed transactions ordered by block height then transaction index descending, including coinbase. Unfiltered sample, not browser table filters; these list rows do not independently establish canonical status.' : 'Specific public transaction summary; status and confirmations reflect the source snapshot.', methodology: 'Fees are exact zatoshis, distinct from payment amount. Unknown fees remain unavailable, never zero. Shielded component presence does not reveal hidden payment amounts, identities or number of users. Transparent input counts may include the coinbase input. Cached API data may lag; block times are header timestamps, not arrival times. Retrieval time is not synchronization evidence. Pending means observed in the node mempool, not confirmed. Stale means indexed record no longer on the canonical chain. No raw transactions, output addresses or memos are supplied.' } };
}
function transactionFallback(result) {
  if (!result.rows.length) return result.query.mode === 'detail' ? 'This transaction was not found in the index or the node’s mempool at lookup time. It may not have reached this explorer yet.' : 'The source returned no indexed transactions.';
  if (result.query.mode === 'latest' && result.rows.length > 1) return `Here are the ${result.rows.length} latest indexed transactions, ordered by block height and position within the block. Open a transaction below to inspect its public details. This is an unfiltered sample, including mining reward transactions where present.`;
  const tx = result.rows[0], f = result.facts;
  const lead = tx.status === 'pending' ? 'This transaction is pending in the node’s mempool; it has not been confirmed.' : tx.status === 'stale' ? 'This transaction’s indexed block is no longer on the canonical chain.' : tx.status === 'confirmed' ? `This transaction is confirmed in block ${f.tx_a_block}, with ${f.tx_a_confirmations} ${tx.confirmations === 1 ? 'confirmation' : 'confirmations'} at the source snapshot.` : tx.status === 'indexed' ? `This transaction is indexed in block ${f.tx_a_block}.` : 'The index contains this transaction, but its confirmation status is unavailable.';
  const contents = tx.coinbase ? 'It is a coinbase transaction, which distributes the mining reward.' : tx.pools.length ? `It contains ${tx.pools.join(' and ')} shielded components${tx.transparentInputs || tx.transparentOutputs ? ' alongside transparent inputs or outputs' : ''}.` : tx.componentsKnown ? 'It has no shielded components.' : '';
  const measurements = [tx.timestamp !== null ? `Block timestamp: ${f.tx_a_time}.` : '', tx.feeZat !== null ? `Transaction fee: ${f.tx_a_fee}.` : '', tx.size !== null ? `Size: ${f.tx_a_size}.` : ''].filter(Boolean).join(' ');
  return [lead, contents, measurements].filter(Boolean).join('\n\n');
}
module.exports = { transactionQuerySchema, resolveTransactionQuery, loadTransactions, transactionFallback };
