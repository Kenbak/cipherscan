const test = require('node:test');
const assert = require('node:assert/strict');
const { deps, pruneAndFetchNodes } = require('../routes/crosslink/_helpers');

test('fork-monitor pruning writes through the primary pool and reads from the replica pool', async () => {
  const reads = [];
  const writes = [];
  deps.pool = {
    query: async (sql) => {
      reads.push(sql);
      return { rows: [] };
    },
  };
  deps.writePool = {
    query: async (sql) => {
      writes.push(sql);
      return { rows: [] };
    },
  };

  await pruneAndFetchNodes();

  assert.equal(writes.length, 1);
  assert.match(writes[0], /^DELETE FROM fork_monitor_nodes/);
  assert.equal(reads.length, 1);
  assert.match(reads[0], /^SELECT name, tip/);
});
