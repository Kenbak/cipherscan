const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// db-pool.js caches its Pool as a module-level singleton, so each scenario
// needs its own fresh process to observe a clean construction. We exercise
// it via a small child-process script that prints the constructed Pool's
// `options` back out as JSON (pg.Pool stores its config on `.options`).

const DB_POOL_PATH = path.join(__dirname, '..', 'lib', 'db-pool.js');

function runScenario(script) {
  const out = execFileSync(process.execPath, ['-e', script], {
    cwd: path.join(__dirname, '..', 'api'), // so `pg` resolves from server/api/node_modules
    env: { ...process.env, DB_NAME: 'test_db', DB_USER: 'test_user', DB_PASSWORD: 'x' },
    encoding: 'utf8',
  });
  return JSON.parse(out.trim().split('\n').pop());
}

test('getPool() applies a default statement_timeout/query_timeout when the caller does not override it', () => {
  const result = runScenario(`
    const { getPool } = require(${JSON.stringify(DB_POOL_PATH)});
    const pool = getPool({ max: 3 });
    console.log(JSON.stringify({
      statement_timeout: pool.options.statement_timeout,
      query_timeout: pool.options.query_timeout,
      max: pool.options.max,
    }));
  `);

  assert.equal(result.statement_timeout, 30000);
  assert.equal(result.query_timeout, 35000);
  assert.equal(result.max, 3);
});

test('getPool() still lets a caller override the query deadline explicitly', () => {
  const result = runScenario(`
    const { getPool } = require(${JSON.stringify(DB_POOL_PATH)});
    const pool = getPool({ max: 2, statement_timeout: 5000, query_timeout: 6000 });
    console.log(JSON.stringify({
      statement_timeout: pool.options.statement_timeout,
      query_timeout: pool.options.query_timeout,
    }));
  `);

  assert.equal(result.statement_timeout, 5000);
  assert.equal(result.query_timeout, 6000);
});

test('hasReadReplica() reflects REPLICA_DB_HOST without constructing a pool', () => {
  const withoutReplica = runScenario(`
    const { hasReadReplica } = require(${JSON.stringify(DB_POOL_PATH)});
    console.log(JSON.stringify({ hasReplica: hasReadReplica() }));
  `);
  assert.equal(withoutReplica.hasReplica, false);
});

test('getReadPool() falls back to the primary pool when no replica is configured', () => {
  const result = runScenario(`
    const { getPool, getReadPool } = require(${JSON.stringify(DB_POOL_PATH)});
    const primary = getPool({ max: 2 });
    const read = getReadPool({ max: 2 });
    console.log(JSON.stringify({ sameInstance: primary === read }));
  `);

  assert.equal(result.sameInstance, true);
});

test('getReadPool() applies the same default query deadline when a replica IS configured', () => {
  const out = execFileSync(process.execPath, ['-e', `
    const { getReadPool } = require(${JSON.stringify(DB_POOL_PATH)});
    const read = getReadPool({ max: 2 });
    console.log(JSON.stringify({
      statement_timeout: read.options.statement_timeout,
      query_timeout: read.options.query_timeout,
      host: read.options.host,
    }));
  `], {
    cwd: path.join(__dirname, '..', 'api'),
    env: {
      ...process.env,
      DB_NAME: 'test_db',
      DB_USER: 'test_user',
      DB_PASSWORD: 'x',
      REPLICA_DB_HOST: 'replica.internal',
    },
    encoding: 'utf8',
  });
  const result = JSON.parse(out.trim().split('\n').pop());

  assert.equal(result.statement_timeout, 30000);
  assert.equal(result.query_timeout, 35000);
  assert.equal(result.host, 'replica.internal');
});
