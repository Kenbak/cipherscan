'use strict';
const { z } = require('zod');
const { createHash } = require('node:crypto');
const { classifyMiningSoftware, SOFTWARE_LABELS } = require('../../../../lib/mining-software');
const identifierSchema = z.string().regex(/^(?:0|[1-9]\d{0,8}|[a-fA-F0-9]{64})$/);
const blockQuerySchema = z.object({ mode: z.enum(['latest', 'recent', 'detail']), identifier: identifierSchema.nullable() }).strict();
function resolveBlockQuery(input) {
  const q = input.question.trim().replace(/[?.!]+$/, '');
  if (/^explain this (page|view)$/i.test(q) && !input.context) {
    if (input.page === 'blocks') return { mode: 'recent', identifier: null };
    if (input.page === 'block' && input.block) return { mode: 'detail', identifier: input.block };
  }
  if (/^(?:(?:show|explain|describe)(?: me)?|tell me about|what is|what's)?\s*(?:the )?(?:latest|newest|most recent) (?:zcash )?block$/i.test(q)) return { mode: 'latest', identifier: null };
  const match = q.match(/^(?:(?:show|explain|describe)(?: me)?|tell me about|what is|what's)?\s*(?:zcash )?block\s+#?(0|[1-9]\d{0,8}|[a-fA-F0-9]{64})$/i);
  if (match) return { mode: 'detail', identifier: match[1] };
  if (/^(?:explain|describe|tell me about) this block$/i.test(q) && input.block) return { mode: 'detail', identifier: input.block };
  return null;
}
function integer(value, max = Number.MAX_SAFE_INTEGER) {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+$/.test(value))) throw new Error('Invalid block integer');
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0 || result > max) throw new Error('Invalid block integer');
  return result;
}
function blockRow(raw) {
  if (!raw || !/^[a-f0-9]{64}$/i.test(raw.hash)) throw new Error('Invalid block hash');
  const fees = raw.total_fees == null ? null : String(raw.total_fees);
  if (fees !== null && (!/^\d{1,24}$/.test(fees) || typeof raw.total_fees === 'number' && !Number.isSafeInteger(raw.total_fees))) throw new Error('Invalid block fees');
  const timestamp = integer(raw.timestamp, 253402300799);
  return { height: integer(raw.height, 999999999), hash: raw.hash.toLowerCase(), timestamp,
    transactions: integer(raw.transaction_count, 2000000), size: integer(raw.size, 2000000), feesZat: fees,
    miner: typeof raw.miner_pool === 'string' && /^[\p{L}\p{N} ._#()'-]{1,80}$/u.test(raw.miner_pool) ? raw.miner_pool : null,
    software: SOFTWARE_LABELS[classifyMiningSoftware(typeof raw.coinbase_hex === 'string' && raw.coinbase_hex.length <= 2000 ? raw.coinbase_hex : null)],
  };
}
function zec(zat) {
  if (zat === null) return 'Unavailable';
  const value = BigInt(zat); return `${value / 100000000n}.${(value % 100000000n).toString().padStart(8, '0')} ZEC`;
}
async function loadBlocks(query, client, signal) {
  query = blockQuerySchema.parse(query);
  if ((query.mode === 'detail') !== (query.identifier !== null)) throw new Error('Invalid block query');
  let height = query.identifier, expectedHash = null;
  if (height && /^[a-f0-9]{64}$/i.test(height)) {
    expectedHash = height.toLowerCase();
    const summary = await client.dispatch('GET', `/api/block/${expectedHash}`, { query: { summary: '1' }, parentSignal: signal });
    if (summary.status === 404) return { status: 'not-found', rows: [], query };
    if (!summary.ok || summary.body?.hash?.toLowerCase() !== expectedHash) throw new Error('Block source unavailable');
    if (summary.body.isOrphaned) return { status: 'orphaned', rows: [], query };
    height = String(integer(summary.body.height, 999999999));
  }
  const params = query.mode === 'detail' ? { limit: '2', min_height: String(Math.max(0, Number(height) - 1)), max_height: height, order: 'newest' } : { limit: query.mode === 'recent' ? '25' : '2' };
  const response = await client.dispatch('GET', '/api/blocks/list', { query: params, parentSignal: signal });
  if (!response.ok || response.body?.success !== true || !Array.isArray(response.body.blocks) || response.body.blocks.length > Number(params.limit)) throw new Error('Block source unavailable');
  const rows = response.body.blocks.map(blockRow);
  for (let i = 0; i < rows.length; i++) {
    if (i && rows[i].height !== rows[i - 1].height - 1) throw new Error('Non-contiguous block sample');
    if (query.mode === 'detail' && (rows[i].height > Number(height) || rows[i].height < Math.max(0, Number(height) - 1))) throw new Error('Block filter ignored');
  }
  if (!rows.length || query.mode === 'detail' && rows[0].height !== Number(height)) return { status: 'not-found', rows: [], query };
  if (expectedHash && rows[0].hash !== expectedHash) throw new Error('Block changed during lookup');
  const visible = query.mode === 'recent' ? rows : rows.slice(0, 1);
  const first = rows[0], previous = rows[1];
  const interval = previous ? first.timestamp - previous.timestamp : null;
  const retrievedAt = new Date().toISOString();
  const facts = { block_height: String(first.height), block_time: new Date(first.timestamp * 1000).toISOString(), block_transactions: String(first.transactions), block_size: `${first.size.toLocaleString('en-US')} bytes`, block_capacity: `${(first.size / 20000).toFixed(2)}%`, block_fees: zec(first.feesZat), block_miner: first.miner || 'Unattributed', block_software: first.software, block_interval: interval === null ? 'Unavailable' : `${interval} seconds`, sample_count: String(visible.length), sample_transactions: String(visible.reduce((sum, row) => sum + row.transactions, 0)), sample_average_capacity: `${(visible.reduce((sum, row) => sum + row.size, 0) / visible.length / 20000).toFixed(2)}%` };
  const blocks = { status: 'found', query, rows: visible, retrievedAt };
  return { ...blocks, facts, evidenceKey: createHash('sha256').update(JSON.stringify([query, rows])).digest('hex'),
    dataContext: { start: new Date(Math.min(...visible.map(row => row.timestamp)) * 1000).toISOString(), end: new Date(Math.max(...visible.map(row => row.timestamp)) * 1000).toISOString(), retrievedAt, source: query.mode === 'recent' ? '/blocks' : `/block/${first.hash}`, label: query.mode === 'recent' ? 'Latest indexed blocks · unfiltered sample' : `Block ${first.height}` },
    input: { facts, scope: query.mode === 'recent' ? 'Latest indexed blocks, unfiltered; not the browser table or its filters.' : query.mode === 'latest' ? 'Latest block returned by the indexed API; not an independently verified node tip.' : 'Specific indexed canonical block.', methodology: 'Txs includes the coinbase transaction. Fees are exact zatoshis converted to ZEC, distinct from subsidy. Capacity uses the 2,000,000-byte block limit. Software is a self-reported coinbase marker, not authenticated identity. Miner attribution may be unavailable. Interval uses consecutive block timestamps, may be negative and is not an arrival time. Retrieval time does not establish node/indexer synchronization.' } };
}
function blockFallback(result) {
  if (result.status === 'not-found') return result.query.mode === 'detail' ? 'No indexed block matched that identifier. It may not have been indexed yet.' : 'The block source returned no indexed blocks.';
  if (result.status === 'orphaned') return 'That hash identifies an orphaned block, which is no longer on the canonical chain. Open its block page to inspect the retained record.';
  const f = result.facts;
  const sample = result.query.mode === 'recent' ? `Across the latest ${f.sample_count} indexed blocks (unfiltered), there are ${f.sample_transactions} transactions including coinbase, with average block capacity use of ${f.sample_average_capacity}.\n\n` : '';
  const label = result.query.mode === 'detail' ? 'Block' : 'The latest indexed block is';
  return `${sample}${label} ${f.block_height}, timestamped ${f.block_time}. It contains ${f.block_transactions} ${f.block_transactions === '1' ? 'transaction' : 'transactions'} including coinbase and uses ${f.block_capacity} of block capacity (${f.block_size}). This block's fees: ${f.block_fees}.\n\nMiner attribution: ${f.block_miner}. Self-reported software marker: ${f.block_software}.${f.block_interval === 'Unavailable' ? '' : ` Its timestamp is ${f.block_interval} from the preceding block.`}`;
}
module.exports = { identifierSchema, blockQuerySchema, resolveBlockQuery, loadBlocks, blockFallback };
