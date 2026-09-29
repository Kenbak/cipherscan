const { createHmac, randomBytes, timingSafeEqual } = require('node:crypto');
const { measureRequestTiming } = require('../request-timing-context');

// Cursors are short-lived browsing state, never an authority supplied by a client.
// A service restart expires them; the UI offers a fresh history view in that case.
const cursorKey = randomBytes(32);
const MAX_OFFSET = 100_000;
class AddressPaginationError extends Error {
  constructor(message, code, status = 400) { super(message); this.publicMessage = message; this.code = code; this.status = status; }
}
function encodeCursor(payload) {
  const value = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${value}.${createHmac('sha256', cursorKey).update(value).digest('base64url')}`;
}
function decodeCursor(value, address, limit, page) {
  if (typeof value !== 'string' || value.length > 4096 || !/^[\w-]+\.[\w-]+$/.test(value))
    throw new AddressPaginationError('Invalid address history cursor', 'ADDRESS_CURSOR_INVALID');
  const [body, signature] = value.split('.');
  const actual = Buffer.from(signature, 'base64url');
  const expected = createHmac('sha256', cursorKey).update(body).digest();
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new AddressPaginationError('This history link has expired. Reload the latest history.', 'ADDRESS_CURSOR_EXPIRED', 409);
  const cursor = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (cursor.a !== address || cursor.l !== limit || cursor.p !== page)
    throw new AddressPaginationError('History cursor does not match this address, page or page size', 'ADDRESS_CURSOR_INVALID');
  if (Date.now() - cursor.time > 60 * 60 * 1000)
    throw new AddressPaginationError('This history link has expired. Reload the latest history.', 'ADDRESS_CURSOR_EXPIRED', 409);
  return cursor;
}
async function withAddressSnapshot(pool, operation) {
  const client = await pool.connect();
  const query = (sql, params) => measureRequestTiming('database', () => client.query(sql, params));
  try {
    await query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const result = await operation(query);
    await query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}
async function prepareAddressPage(query, { address, page, limit, total, cursor: rawCursor }) {
  const cursor = rawCursor ? decodeCursor(rawCursor, address, limit, page) : null;
  let snapshot;
  if (cursor) {
    const { rows } = await query('SELECT height, hash FROM blocks WHERE height = $1 AND hash = $2', [cursor.s.height, cursor.s.hash]);
    if (!rows.length) throw new AddressPaginationError('The chain changed since this history view. Reload the latest history.', 'ADDRESS_SNAPSHOT_CHANGED', 409);
    snapshot = cursor.s;
    total = cursor.n;
  } else {
    const { rows } = await query('SELECT height, hash FROM blocks ORDER BY height DESC LIMIT 1');
    if (!rows.length) throw new AddressPaginationError('Address history is temporarily unavailable', 'ADDRESS_HISTORY_UNAVAILABLE', 503);
    snapshot = { height: Number(rows[0].height), hash: rows[0].hash };
  }
  const totalPages = Math.ceil(total / limit);
  if (page > Math.max(1, totalPages)) throw new AddressPaginationError('Address history page does not exist', 'ADDRESS_PAGE_NOT_FOUND', 404);
  const offset = (page - 1) * limit;
  const size = Math.min(limit, Math.max(0, total - offset));
  const reverseOffset = Math.max(0, total - offset - size);
  const ascending = cursor ? cursor.d !== 'next' : reverseOffset < offset;
  const skip = cursor ? 0 : Math.min(offset, reverseOffset);
  if (skip > MAX_OFFSET) throw new AddressPaginationError('Use the Next, Previous or Last history links to reach this page without a deep offset scan.', 'ADDRESS_CURSOR_REQUIRED');
  return { address, page, limit, total, totalPages, snapshot, size, ascending, skip, cursor };
}
function addressPageSql(plan) {
  const order = plan.ascending ? 'ASC' : 'DESC';
  const boundary = plan.cursor?.b;
  const comparison = plan.cursor?.d === 'prev' ? '>' : '<';
  return {
    params: [plan.address, plan.size, plan.skip, plan.snapshot.height, ...(boundary ? [boundary.height, boundary.index, boundary.txid] : [])],
    sql: `WITH paged AS MATERIALIZED (
      SELECT txid, block_height, tx_index
      FROM address_transactions
      WHERE address = $1 AND block_height <= $4
      ${boundary ? `AND (block_height, tx_index, txid) ${comparison} ($5, $6, $7)` : ''}
      ORDER BY block_height ${order}, tx_index ${order}, txid ${order}
      LIMIT $2 OFFSET $3
    )
    SELECT p.txid, p.block_height, a.block_time, t.size, p.tx_index,
      t.has_sapling, t.has_orchard, t.has_ironwood,
      COALESCE(a.value_in, 0) AS input_value, COALESCE(a.value_out, 0) AS output_value,
      other_in.addresses AS sender_addresses, other_out.addresses AS recipient_addresses
    FROM paged p
    JOIN address_transactions a ON a.address = $1
      AND (a.block_height, a.tx_index, a.txid) = (p.block_height, p.tx_index, p.txid)
    JOIN transactions t ON t.txid = p.txid
    LEFT JOIN LATERAL (
      SELECT ARRAY_AGG(DISTINCT address) AS addresses FROM transaction_inputs
      WHERE txid = p.txid AND address IS NOT NULL AND address != $1
    ) other_in ON true
    LEFT JOIN LATERAL (
      SELECT ARRAY_AGG(DISTINCT address) AS addresses FROM transaction_outputs
      WHERE txid = p.txid AND address IS NOT NULL AND address != $1
    ) other_out ON true
    ORDER BY p.block_height DESC, p.tx_index DESC, p.txid DESC`,
  };
}
function addressPagination(plan, rows) {
  // Never turn incomplete/mismatched indexed history into plausible empty pages.
  if (rows.length !== plan.size) throw new AddressPaginationError('Address history is being updated. Reload the latest history.', 'ADDRESS_HISTORY_INCONSISTENT', 503);
  const boundary = row => ({ height: row.block_height, index: row.tx_index, txid: row.txid });
  const token = (page, direction, row) => encodeCursor({
    a: plan.address, l: plan.limit, p: page, n: plan.total, s: plan.snapshot,
    d: direction, ...(row ? { b: boundary(row) } : {}), time: plan.cursor?.time ?? Date.now(),
  });
  return {
    page: plan.page, limit: plan.limit, total: plan.total, totalPages: plan.totalPages,
    hasNext: plan.page < plan.totalPages, hasPrev: plan.page > 1,
    nextCursor: plan.page < plan.totalPages ? token(plan.page + 1, 'next', rows.at(-1)) : null,
    prevCursor: plan.page > 1 ? token(plan.page - 1, 'prev', rows[0]) : null,
    lastCursor: plan.page < plan.totalPages ? token(plan.totalPages, 'last') : null,
    snapshotHeight: plan.snapshot.height,
  };
}
module.exports = { AddressPaginationError, withAddressSnapshot, prepareAddressPage, addressPageSql, addressPagination };
