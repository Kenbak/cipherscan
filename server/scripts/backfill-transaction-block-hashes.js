#!/usr/bin/env node
/**
 * Audit and repair transactions.block_hash without inferring membership from
 * block_height alone.
 *
 * Modes:
 *   --audit   SQL-only counts and samples (default; never writes)
 *   --verify  Ask Zebra to verify each candidate (never writes)
 *   --apply   Update only Zebra-verified rows that also match local canonical blocks
 *
 * Zebra calls deliberately mirror the indexer and repair scripts already used
 * by this repository: getrawtransaction(txid, 1), then getblock(blockhash, 1).
 */

const fs = require('fs');
const http = require('http');
const https = require('https');
const { Pool } = require('pg');

const HASH_PATTERN = /^[0-9a-f]{64}$/i;
const LOCK_NAME = 'cipherscan:transaction-block-hash-backfill';

function parsePositiveInteger(value, flag) {
  if (!/^\d+$/.test(value || '') || Number(value) <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return Number(value);
}

function parseArgs(argv) {
  const exactFlags = new Set([
    '--audit',
    '--verify',
    '--apply',
    '--include-mismatched',
    '--all',
    '--verbose',
  ]);
  const valueFlagPrefixes = ['--limit=', '--batch-size=', '--sample-size=', '--start-after='];
  const unknown = argv.filter((arg) => (
    !exactFlags.has(arg) && !valueFlagPrefixes.some((prefix) => arg.startsWith(prefix))
  ));
  if (unknown.length > 0) {
    throw new Error(`Unknown argument(s): ${unknown.join(', ')}`);
  }

  const modeFlags = argv.filter((arg) => ['--audit', '--verify', '--apply'].includes(arg));
  if (modeFlags.length > 1) {
    throw new Error('Choose exactly one of --audit, --verify, or --apply');
  }

  const options = {
    mode: modeFlags[0]?.slice(2) || 'audit',
    includeMismatched: argv.includes('--include-mismatched'),
    all: argv.includes('--all'),
    verbose: argv.includes('--verbose'),
    limit: 1000,
    batchSize: 100,
    sampleSize: 20,
    startAfter: '',
  };

  for (const arg of argv) {
    if (arg.startsWith('--limit=')) {
      options.limit = parsePositiveInteger(arg.slice('--limit='.length), '--limit');
    } else if (arg.startsWith('--batch-size=')) {
      options.batchSize = parsePositiveInteger(arg.slice('--batch-size='.length), '--batch-size');
    } else if (arg.startsWith('--sample-size=')) {
      options.sampleSize = parsePositiveInteger(arg.slice('--sample-size='.length), '--sample-size');
    } else if (arg.startsWith('--start-after=')) {
      options.startAfter = arg.slice('--start-after='.length).toLowerCase();
      if (!HASH_PATTERN.test(options.startAfter)) {
        throw new Error('--start-after must be a 64-character transaction ID');
      }
    }
  }

  if (options.all && argv.some((arg) => arg.startsWith('--limit='))) {
    throw new Error('Use either --all or --limit, not both');
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node backfill-transaction-block-hashes.js [mode] [options]

Modes:
  --audit                 SQL-only audit (default; no Zebra calls or writes)
  --verify                Verify candidates against Zebra; do not write
  --apply                 Verify and update candidates

Options:
  --limit=N               Process at most N candidates (default: 1000)
  --all                   Process all candidates
  --batch-size=N          Candidate query batch size (default: 100)
  --start-after=TXID      Resume after this txid in lexical order
  --include-mismatched    Also inspect valid hashes not on the local canonical chain
  --sample-size=N         Audit sample size (default: 20)
  --verbose               Print every candidate outcome
  --help                  Show this help

Rows are changed only when Zebra proves transaction membership in a block and
that exact (height, hash) pair exists in the local canonical blocks table.`);
}

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function getPoolConfig() {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL, max: 3 };
  }
  if (!process.env.DB_NAME) {
    throw new Error('Set DATABASE_URL or DB_NAME explicitly before running this script');
  }
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    max: 3,
  };
}

function getZebraAuthorization() {
  const cookieFile = process.env.ZEBRA_RPC_COOKIE_FILE || '/root/.cache/zebra/.cookie';
  try {
    const cookie = fs.readFileSync(cookieFile, 'utf8').trim();
    if (cookie) return `Basic ${Buffer.from(cookie).toString('base64')}`;
  } catch {
    // Fall through to the user/password convention used by repair scripts.
  }

  const user = process.env.ZCASH_RPC_USER;
  const password = process.env.ZCASH_RPC_PASSWORD;
  if (user || password) {
    return `Basic ${Buffer.from(`${user || '__cookie__'}:${password || ''}`).toString('base64')}`;
  }
  return null;
}

function callZebraRPC(method, params = []) {
  const endpoint = new URL(
    process.env.ZCASH_RPC_URL || process.env.ZEBRA_RPC_URL || 'http://127.0.0.1:8232'
  );
  const transport = endpoint.protocol === 'https:' ? https : http;
  const body = JSON.stringify({ jsonrpc: '2.0', id: 'block-hash-backfill', method, params });
  const authorization = getZebraAuthorization();

  return new Promise((resolve, reject) => {
    const request = transport.request({
      protocol: endpoint.protocol,
      hostname: endpoint.hostname,
      port: endpoint.port,
      path: `${endpoint.pathname}${endpoint.search}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...(authorization ? { Authorization: authorization } : {}),
      },
      timeout: 30000,
    }, (response) => {
      let data = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch {
          reject(new Error(`${method}: invalid JSON response (${data.slice(0, 160)})`));
          return;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`${method}: HTTP ${response.statusCode}`));
          return;
        }
        if (parsed.error) {
          reject(new Error(`${method}: ${parsed.error.message || JSON.stringify(parsed.error)}`));
          return;
        }
        resolve(parsed.result);
      });
    });

    request.on('timeout', () => request.destroy(new Error(`${method}: timed out`)));
    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

async function assertSchema(pool) {
  const result = await pool.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND (
        (table_name = 'transactions' AND column_name = ANY($1::text[]))
        OR (table_name = 'blocks' AND column_name = ANY($2::text[]))
      )
  `, [
    ['txid', 'block_height', 'block_hash', 'block_time', 'tx_index'],
    ['height', 'hash', 'timestamp'],
  ]);

  const found = new Set(result.rows.map((row) => `${row.table_name}.${row.column_name}`));
  const required = [
    'transactions.txid',
    'transactions.block_height',
    'transactions.block_hash',
    'transactions.block_time',
    'transactions.tx_index',
    'blocks.height',
    'blocks.hash',
    'blocks.timestamp',
  ];
  const missing = required.filter((column) => !found.has(column));
  if (missing.length > 0) {
    throw new Error(`Required schema is missing: ${missing.join(', ')}`);
  }
}

async function getAudit(pool, sampleSize) {
  const summaryResult = await pool.query(`
    SELECT
      COUNT(*) AS total_transactions,
      COUNT(*) FILTER (WHERE t.block_height IS NULL OR t.block_height <= 0) AS unmined_or_unknown,
      COUNT(*) FILTER (
        WHERE t.block_height > 0 AND (t.block_hash IS NULL OR btrim(t.block_hash) = '')
      ) AS missing_hash,
      COUNT(*) FILTER (
        WHERE t.block_height > 0
          AND t.block_hash IS NOT NULL
          AND btrim(t.block_hash) <> ''
          AND t.block_hash !~ '^[0-9A-Fa-f]{64}$'
      ) AS malformed_hash,
      COUNT(*) FILTER (
        WHERE t.block_height > 0 AND exact_block.hash IS NOT NULL
      ) AS canonical_match,
      COUNT(*) FILTER (
        WHERE t.block_height > 0
          AND t.block_hash ~ '^[0-9A-Fa-f]{64}$'
          AND exact_block.hash IS NULL
          AND height_block.hash IS NOT NULL
      ) AS noncanonical_or_mismatched,
      COUNT(*) FILTER (
        WHERE t.block_height > 0 AND height_block.hash IS NULL
      ) AS local_block_missing
    FROM transactions t
    LEFT JOIN blocks height_block ON height_block.height = t.block_height
    LEFT JOIN blocks exact_block
      ON exact_block.height = t.block_height AND exact_block.hash = t.block_hash
  `);

  const sampleResult = await pool.query(`
    SELECT
      t.txid,
      t.block_height,
      t.block_hash,
      height_block.hash AS local_canonical_hash,
      CASE
        WHEN t.block_hash IS NULL OR btrim(t.block_hash) = '' THEN 'missing_hash'
        WHEN t.block_hash !~ '^[0-9A-Fa-f]{64}$' THEN 'malformed_hash'
        WHEN height_block.hash IS NULL THEN 'local_block_missing'
        ELSE 'noncanonical_or_mismatched'
      END AS issue
    FROM transactions t
    LEFT JOIN blocks height_block ON height_block.height = t.block_height
    LEFT JOIN blocks exact_block
      ON exact_block.height = t.block_height AND exact_block.hash = t.block_hash
    WHERE t.block_height > 0
      AND (
        t.block_hash IS NULL
        OR btrim(t.block_hash) = ''
        OR t.block_hash !~ '^[0-9A-Fa-f]{64}$'
        OR exact_block.hash IS NULL
      )
    ORDER BY t.block_height DESC, t.txid
    LIMIT $1
  `, [sampleSize]);

  return { summary: summaryResult.rows[0], sample: sampleResult.rows };
}

function printAudit(audit) {
  log('Database audit:');
  for (const [key, value] of Object.entries(audit.summary)) {
    log(`  ${key}: ${Number(value).toLocaleString()}`);
  }
  if (audit.sample.length > 0) {
    log('Sample rows requiring review:');
    for (const row of audit.sample) {
      log(`  ${row.issue} height=${row.block_height} txid=${row.txid} recorded=${row.block_hash || 'NULL'} canonical=${row.local_canonical_hash || 'NONE'}`);
    }
  }
}

async function getCandidates(pool, options, afterTxid, limit) {
  const result = await pool.query(`
    SELECT
      t.txid,
      t.block_height,
      t.block_hash,
      t.block_time,
      t.tx_index
    FROM transactions t
    LEFT JOIN blocks exact_block
      ON exact_block.height = t.block_height AND exact_block.hash = t.block_hash
    WHERE t.block_height > 0
      AND t.txid > $1
      AND (
        t.block_hash IS NULL
        OR btrim(t.block_hash) = ''
        OR t.block_hash !~ '^[0-9A-Fa-f]{64}$'
        OR ($2::boolean AND exact_block.hash IS NULL)
      )
    ORDER BY t.txid
    LIMIT $3
  `, [afterTxid, options.includeMismatched, limit]);
  return result.rows;
}

async function verifyCandidate(pool, candidate) {
  let rawTransaction;
  try {
    rawTransaction = await callZebraRPC('getrawtransaction', [candidate.txid, 1]);
  } catch (error) {
    return { status: 'rpc_error', error: error.message };
  }

  const blockHash = typeof rawTransaction?.blockhash === 'string'
    ? rawTransaction.blockhash.toLowerCase()
    : '';
  if (!HASH_PATTERN.test(blockHash)) {
    return { status: 'no_canonical_block_hash' };
  }
  if (typeof rawTransaction.txid === 'string' && rawTransaction.txid.toLowerCase() !== candidate.txid.toLowerCase()) {
    return { status: 'transaction_identity_mismatch' };
  }

  let block;
  try {
    block = await callZebraRPC('getblock', [blockHash, 1]);
  } catch (error) {
    return { status: 'rpc_error', error: error.message };
  }

  const blockHeight = Number(block?.height);
  const blockTime = Number(block?.time);
  const returnedHash = typeof block?.hash === 'string' ? block.hash.toLowerCase() : '';
  if (!Number.isSafeInteger(blockHeight) || blockHeight < 0 || !Number.isFinite(blockTime)) {
    return { status: 'invalid_block_response' };
  }
  if (returnedHash !== blockHash || !Array.isArray(block.tx)) {
    return { status: 'invalid_block_response' };
  }

  const txids = block.tx.map((txid) => String(txid).toLowerCase());
  const txIndex = txids.indexOf(candidate.txid.toLowerCase());
  if (txIndex === -1) {
    return { status: 'block_membership_mismatch' };
  }

  const canonicalResult = await pool.query(
    `SELECT height, hash, timestamp
     FROM blocks
     WHERE height = $1 AND lower(hash) = $2`,
    [blockHeight, blockHash]
  );
  if (canonicalResult.rows.length !== 1) {
    return { status: 'local_canonical_mismatch', blockHeight, blockHash };
  }

  const canonical = canonicalResult.rows[0];
  const target = {
    blockHeight,
    blockHash: canonical.hash,
    blockTime,
    txIndex,
  };
  const needsUpdate = Number(candidate.block_height) !== target.blockHeight
    || candidate.block_hash !== target.blockHash
    || Number(candidate.block_time) !== target.blockTime
    || Number(candidate.tx_index) !== target.txIndex;

  return { status: 'verified', target, needsUpdate };
}

async function getOptionalTables(pool) {
  const result = await pool.query(`
    SELECT
      to_regclass('shielded_flows') IS NOT NULL AS shielded_flows,
      to_regclass('address_transactions') IS NOT NULL AS address_transactions
  `);
  return result.rows[0];
}

async function applyVerified(pool, candidate, verification, optionalTables) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '5s'");

    const currentResult = await client.query(
      `SELECT txid, block_height, block_hash, block_time, tx_index
       FROM transactions WHERE txid = $1 FOR UPDATE`,
      [candidate.txid]
    );
    if (currentResult.rows.length !== 1) {
      await client.query('ROLLBACK');
      return 'row_disappeared';
    }

    const target = verification.target;
    const blockResult = await client.query(
      `SELECT height, hash FROM blocks
       WHERE height = $1 AND hash = $2
       FOR SHARE`,
      [target.blockHeight, target.blockHash]
    );
    if (blockResult.rows.length !== 1) {
      await client.query('ROLLBACK');
      return 'local_canonical_changed';
    }

    const current = currentResult.rows[0];
    const alreadyCorrect = Number(current.block_height) === target.blockHeight
      && current.block_hash === target.blockHash
      && Number(current.block_time) === target.blockTime
      && Number(current.tx_index) === target.txIndex;
    if (alreadyCorrect) {
      await client.query('COMMIT');
      return 'already_correct';
    }

    await client.query(`
      UPDATE transactions
      SET block_height = $2,
          block_hash = $3,
          block_time = $4,
          tx_index = $5
      WHERE txid = $1
    `, [candidate.txid, target.blockHeight, target.blockHash, target.blockTime, target.txIndex]);

    if (optionalTables.shielded_flows) {
      await client.query(
        `UPDATE shielded_flows SET block_height = $2, block_time = $3 WHERE txid = $1`,
        [candidate.txid, target.blockHeight, target.blockTime]
      );
    }
    if (optionalTables.address_transactions) {
      await client.query(
        `UPDATE address_transactions SET block_height = $2, block_time = $3 WHERE txid = $1`,
        [candidate.txid, target.blockHeight, target.blockTime]
      );
    }

    await client.query('COMMIT');
    return 'updated';
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve original error */ }
    throw error;
  } finally {
    client.release();
  }
}

function newCounters() {
  return {
    checked: 0,
    verified: 0,
    would_update: 0,
    updated: 0,
    already_correct: 0,
    no_canonical_block_hash: 0,
    local_canonical_mismatch: 0,
    block_membership_mismatch: 0,
    transaction_identity_mismatch: 0,
    invalid_block_response: 0,
    rpc_error: 0,
    local_canonical_changed: 0,
    row_disappeared: 0,
    apply_error: 0,
  };
}

function printCounters(counters) {
  log('Verification summary:');
  for (const [key, value] of Object.entries(counters)) {
    log(`  ${key}: ${value.toLocaleString()}`);
  }
}

async function processCandidates(pool, options) {
  await callZebraRPC('getblockchaininfo');
  log('Zebra RPC connected');

  const optionalTables = await getOptionalTables(pool);
  const counters = newCounters();
  let cursor = options.startAfter;
  let lockClient = null;

  if (options.mode === 'apply') {
    lockClient = await pool.connect();
    const lockResult = await lockClient.query(
      'SELECT pg_try_advisory_lock(hashtext($1)) AS acquired',
      [LOCK_NAME]
    );
    if (!lockResult.rows[0].acquired) {
      lockClient.release();
      throw new Error('Another transaction block-hash backfill is already running');
    }
  }

  try {
    while (options.all || counters.checked < options.limit) {
      const remaining = options.all ? options.batchSize : options.limit - counters.checked;
      const batch = await getCandidates(pool, options, cursor, Math.min(options.batchSize, remaining));
      if (batch.length === 0) break;

      for (const candidate of batch) {
        cursor = candidate.txid;
        counters.checked += 1;
        const verification = await verifyCandidate(pool, candidate);
        if (verification.status !== 'verified') {
          counters[verification.status] += 1;
          if (options.verbose || verification.status === 'rpc_error') {
            log(`${candidate.txid}: ${verification.status}${verification.error ? ` (${verification.error})` : ''}`);
          }
          continue;
        }

        counters.verified += 1;
        if (!verification.needsUpdate) {
          counters.already_correct += 1;
          if (options.verbose) log(`${candidate.txid}: already_correct`);
          continue;
        }

        if (options.mode === 'verify') {
          counters.would_update += 1;
          if (options.verbose) {
            log(`${candidate.txid}: would_update height=${verification.target.blockHeight} hash=${verification.target.blockHash}`);
          }
          continue;
        }

        try {
          const outcome = await applyVerified(pool, candidate, verification, optionalTables);
          counters[outcome] += 1;
          if (options.verbose) log(`${candidate.txid}: ${outcome}`);
        } catch (error) {
          counters.apply_error += 1;
          log(`${candidate.txid}: apply_error (${error.message})`);
        }
      }

      log(`Processed ${counters.checked.toLocaleString()} candidate(s); last txid ${cursor}`);
    }
  } finally {
    if (lockClient) {
      try { await lockClient.query('SELECT pg_advisory_unlock(hashtext($1))', [LOCK_NAME]); } catch { /* connection close releases it */ }
      lockClient.release();
    }
  }

  printCounters(counters);
  if (!options.all && counters.checked === options.limit) {
    log(`Stopped at --limit=${options.limit}; rerun to continue from the first remaining candidate, or use --start-after=${cursor}`);
  }
  if (options.includeMismatched) {
    log('Valid non-canonical hashes may represent intentionally retained stale/orphan transactions; unresolved rows were not changed.');
  }
  if (counters.rpc_error > 0 || counters.apply_error > 0) process.exitCode = 1;
}

async function main() {
  if (process.argv.includes('--help')) {
    printHelp();
    return;
  }

  const options = parseArgs(process.argv.slice(2));
  const pool = new Pool(getPoolConfig());
  try {
    const identityResult = await pool.query('SELECT current_database() AS database');
    log(`Database connected: ${identityResult.rows[0].database}; mode=${options.mode}`);
    await assertSchema(pool);
    const audit = await getAudit(pool, options.sampleSize);
    printAudit(audit);

    if (options.mode === 'audit') {
      log('Audit mode complete; no Zebra calls or writes were made.');
      return;
    }

    await processCandidates(pool, options);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`FATAL: ${error.message}`);
  process.exitCode = 1;
});
