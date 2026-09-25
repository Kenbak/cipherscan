'use strict';
const { z } = require('zod');
const { createHash } = require('node:crypto');
const querySchema = z.object({ direction: z.enum(['shield', 'deshield']), pool: z.enum(['all', 'sapling', 'orchard', 'ironwood', 'mixed']), sort: z.enum(['latest', 'largest', 'both']), hours: z.enum(['24']), limit: z.number().int().min(1).max(10) }).strict();
async function loadTransfers(query, client, signal, now = Date.now()) {
  query = querySchema.parse(query);
  const end = Math.floor(now / 1000), start = end - Number(query.hours) * 3600;
  let requests = 0;
  async function scan(minZec, latestOnly = false) {
    const rows = [], seen = new Set(), transactions = new Set();
    let cursor = null, cursorId = null, previous = null;
    while (requests++ < 20) {
      const result = await client.dispatch('GET', '/api/shielded/list', { query: { flow_type: query.direction, pool: query.pool, limit: '100', ...(minZec ? { min_zec: String(minZec) } : {}), ...(cursor === null ? {} : { cursor: String(cursor), cursor_id: String(cursorId) }) }, parentSignal: signal });
      if (!result.ok || result.body?.success !== true || !Array.isArray(result.body.flows) || result.body.flows.length > 100) throw new Error('Flow source unavailable');
      const body = result.body;
      for (const row of body.flows) {
        if (!Number.isSafeInteger(row.id) || !Number.isSafeInteger(row.blockTime) || !Number.isSafeInteger(row.blockHeight) || !/^[a-f0-9]{64}$/.test(row.txid) || row.flowType !== query.direction || !['sprout', 'sapling', 'orchard', 'ironwood', 'mixed'].includes(row.pool) || query.pool !== 'all' && row.pool !== query.pool) throw new Error('Invalid flow record');
        // The canonical schema enforces UNIQUE(txid, flow_type). Do not silently
        // sum duplicates: amount filtering/ranking relies on that authority.
        if (seen.has(row.id) || transactions.has(row.txid) || previous && (row.blockTime > previous.blockTime || row.blockTime === previous.blockTime && row.id >= previous.id)) throw new Error('Flow collection changed');
        seen.add(row.id); transactions.add(row.txid); previous = row;
        if (row.blockTime < start) return { rows, complete: true };
        if (row.blockTime > end) continue;
        let amountZat;
        if (typeof row.amountZat === 'string' && /^\d+$/.test(row.amountZat)) amountZat = row.amountZat;
        // Legacy JSON amounts are reported values, not authoritative integers.
        else if (typeof row.amountZec === 'number' && Number.isFinite(row.amountZec) && row.amountZec >= 0 && Number.isSafeInteger(Math.round(row.amountZec * 1e8))) amountZat = String(Math.round(row.amountZec * 1e8));
        else throw new Error('Invalid public amount');
        if (BigInt(amountZat) < BigInt(minZec) * 100000000n) throw new Error('Source ignored amount filter');
        rows.push({ txid: row.txid, blockHeight: row.blockHeight, blockTime: row.blockTime, pools: [row.pool], amountZat, amountAuthority: typeof row.amountZat === 'string' ? 'exact-zatoshi' : 'legacy-reported-zec' });
        if (latestOnly && rows.length === query.limit) return { rows, complete: true };
      }
      if (body.pagination?.hasNext === false) return { rows, complete: true };
      if (!body.flows.length || !Number.isSafeInteger(body.pagination?.nextCursor) || !Number.isSafeInteger(body.pagination?.nextCursorId) || body.pagination.nextCursor !== previous.blockTime || body.pagination.nextCursorId !== previous.id) throw new Error('Invalid flow pagination');
      cursor = body.pagination.nextCursor; cursorId = body.pagination.nextCursorId;
    }
    return { rows, complete: false };
  }
  const groups = [];
  let complete = true;
  if (query.sort !== 'largest') {
    const latest = await scan(0, true);
    groups.push({ kind: 'latest', rows: latest.rows.slice(0, query.limit) });
    complete = latest.complete;
  }
  if (query.sort !== 'latest') {
    let ranked = { rows: [], complete: false };
    // Cover the entire window above a threshold. If it contains enough rows,
    // lower amounts cannot enter the top N. Otherwise lower the threshold.
    // This avoids walking thousands of tiny transfers for a top-five query.
    for (const threshold of [1000, 100, 0]) {
      ranked = await scan(threshold);
      if (!ranked.complete || ranked.rows.length >= query.limit || threshold === 0) break;
    }
    complete = complete && ranked.complete;
    const rows = ranked.complete ? ranked.rows.sort((a, b) => BigInt(a.amountZat) > BigInt(b.amountZat) ? -1 : BigInt(a.amountZat) < BigInt(b.amountZat) ? 1 : b.blockTime - a.blockTime || a.txid.localeCompare(b.txid)).slice(0, query.limit) : [];
    groups.push({ kind: 'largest', rows });
  }
  return { direction: query.direction, pool: query.pool, start: new Date(start * 1000).toISOString(), end: new Date(end * 1000).toISOString(), retrievedAt: new Date().toISOString(), complete, groups, evidenceKey: createHash('sha256').update(JSON.stringify([query, start, end, groups])).digest('hex') };
}
module.exports = { querySchema, loadTransfers };
