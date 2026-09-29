const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareAddressPage, addressPageSql, addressPagination, withAddressSnapshot } = require('../api/lib/address-pagination');

test('snapshot transaction rolls back and releases the connection on failure', async () => {
  const calls = [];
  const pool = { connect: async () => ({ query: async sql => calls.push(sql), release: () => calls.push('release') }) };
  await assert.rejects(withAddressSnapshot(pool, async () => { throw new Error('failure'); }), /failure/);
  assert.deepEqual(calls, ['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY', 'ROLLBACK', 'release']);
});

test('PostgreSQL address cursors traverse exact pages, last/previous, growth, reorgs and invalid cursors', {
  skip: !process.env.ADDRESS_TEST_DATABASE_URL,
}, async t => {
  const { Client } = require('pg');
  const db = new Client({ connectionString: process.env.ADDRESS_TEST_DATABASE_URL });
  await db.connect(); t.after(() => db.end());
  await db.query(`
    CREATE TEMP TABLE blocks(height int PRIMARY KEY, hash text);
    CREATE TEMP TABLE address_transactions(address text, txid text, block_height int, tx_index int, block_time bigint, value_in bigint, value_out bigint, PRIMARY KEY(address,block_height,tx_index,txid));
    CREATE TEMP TABLE transactions(txid text PRIMARY KEY, size int, has_sapling boolean, has_orchard boolean, has_ironwood boolean);
    CREATE TEMP TABLE transaction_inputs(txid text, address text);
    CREATE TEMP TABLE transaction_outputs(txid text, address text);
    CREATE INDEX ON transaction_inputs(txid); CREATE INDEX ON transaction_outputs(txid);
    INSERT INTO blocks VALUES (100,'tip');
    INSERT INTO address_transactions SELECT 'a',lpad(i::text,64,'0'),i/3,i%3,1000-i,0,i FROM generate_series(1,78) i;
    INSERT INTO transactions SELECT txid,100,false,false,false FROM address_transactions;
  `);
  const query = db.query.bind(db);
  async function read(page, cursor, total = 78, address = 'a', limit = 25) {
    const plan = await prepareAddressPage(query, { address, page, limit, total, cursor });
    const q = addressPageSql(plan);
    const { rows } = await query(q.sql, q.params);
    return { rows, pagination: addressPagination(plan, rows), plan };
  }
  const p1 = await read(1);
  assert.deepEqual(p1.rows.map(r => Number(r.output_value)), Array.from({ length: 25 }, (_, i) => 78-i));
  await db.query("INSERT INTO blocks VALUES(101,'new'); INSERT INTO address_transactions VALUES('a','new',101,0,2000,0,999); INSERT INTO transactions VALUES('new',100,false,false,false)");
  const p2 = await read(2, p1.pagination.nextCursor, 79);
  const p3 = await read(3, p2.pagination.nextCursor, 79);
  const p4 = await read(4, p3.pagination.nextCursor, 79);
  assert.equal(p4.pagination.total, 78);
  assert.equal(p4.pagination.snapshotHeight, 100);
  assert.equal(p4.pagination.hasNext, false);
  assert.deepEqual([...p1.rows,...p2.rows,...p3.rows,...p4.rows].map(r => Number(r.output_value)), Array.from({ length: 78 }, (_, i) => 78-i));
  assert.deepEqual((await read(4, p1.pagination.lastCursor, 79)).rows, p4.rows);
  assert.deepEqual((await read(3, p4.pagination.prevCursor, 79)).rows, p3.rows);
  assert.deepEqual((await read(1, p2.pagination.prevCursor, 79)).rows, p1.rows);
  assert.equal((await read(1, null, 79)).rows[0].txid, 'new');
  // A direct numeric last-page URL is also bounded by a reverse index seek.
  const last = await read(4, null, 79);
  assert.equal(last.plan.skip, 0);
  assert.equal(last.rows.length, 4);
  await assert.rejects(read(2, p1.pagination.nextCursor + 'x'), { code: 'ADDRESS_CURSOR_EXPIRED' });
  await assert.rejects(read(2, 'broken'), { code: 'ADDRESS_CURSOR_INVALID' });
  await assert.rejects(read(3, p1.pagination.nextCursor), { code: 'ADDRESS_CURSOR_INVALID' });
  await assert.rejects(read(2, p1.pagination.nextCursor, 79, 'other'), { code: 'ADDRESS_CURSOR_INVALID' });
  await assert.rejects(read(2, p1.pagination.nextCursor, 79, 'a', 10), { code: 'ADDRESS_CURSOR_INVALID' });
  await assert.rejects(read(9999999), { code: 'ADDRESS_PAGE_NOT_FOUND' });
  const originalNow = Date.now;
  Date.now = () => originalNow() + 3600001;
  try { await assert.rejects(read(2, p1.pagination.nextCursor), { code: 'ADDRESS_CURSOR_EXPIRED' }); }
  finally { Date.now = originalNow; }
  await db.query("UPDATE blocks SET hash='reorg' WHERE height=100");
  await assert.rejects(read(2, p1.pagination.nextCursor), { code: 'ADDRESS_SNAPSHOT_CHANGED' });
  // Deep cursors seek independently of total history size; random middle offsets stay guarded.
  const deepPlan = await prepareAddressPage(query, { address:'a',page:1,limit:25,total:774663 });
  const deepLast = addressPagination(deepPlan,p1.rows).lastCursor;
  const deep = await prepareAddressPage(query, { address:'a',page:30987,limit:25,total:774663,cursor:deepLast });
  assert.equal(deep.skip,0); assert.equal(deep.size,13);
  await assert.rejects(prepareAddressPage(query, { address:'a',page:15000,limit:25,total:774663 }), { code:'ADDRESS_CURSOR_REQUIRED' });
  assert.throws(() => addressPagination(deep,[]), { code:'ADDRESS_HISTORY_INCONSISTENT' });
});
