/**
 * Shared helpers and dependency injection for transaction routes.
 */

const { createListCache } = require('../../list-cache');

const disabledListCache = createListCache({ enabled: false });

const deps = {
  pool: null,
  callZebraRPC: null,
  CompactTxStreamer: null,
  grpc: null,
  findLinkedTransactions: null,
  listCache: disabledListCache,
};

let hasStakingColumns = null;

function isCanonicalIntegerQuery(value) {
  if (value === undefined) return true;
  if (typeof value !== 'string' || !/^-?\d+$/.test(value)) return false;
  return Number.isSafeInteger(Number.parseInt(value, 10));
}

function isCanonicalDecimalQuery(value) {
  if (value === undefined) return true;
  if (typeof value !== 'string' || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return false;
  return Number.isFinite(Number.parseFloat(value));
}

function isKnownQueryValue(value, allowed) {
  return value === undefined || (typeof value === 'string' && allowed.includes(value));
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

async function checkStakingColumns(db) {
  if (hasStakingColumns !== null) return hasStakingColumns;
  try {
    const result = await db.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'transactions' AND column_name = 'staking_action_type'`
    );
    hasStakingColumns = result.rows.length > 0;
  } catch {
    hasStakingColumns = false;
  }
  return hasStakingColumns;
}

function injectDependencies(req, res, next) {
  deps.pool = req.app.locals.pool;
  deps.callZebraRPC = req.app.locals.callZebraRPC;
  deps.CompactTxStreamer = req.app.locals.CompactTxStreamer;
  deps.grpc = req.app.locals.grpc;
  deps.findLinkedTransactions = req.app.locals.findLinkedTransactions;
  deps.listCache = req.app.locals.listCache || disabledListCache;
  next();
}

module.exports = {
  deps,
  disabledListCache,
  isCanonicalIntegerQuery,
  isCanonicalDecimalQuery,
  isKnownQueryValue,
  finiteOrNull,
  checkStakingColumns,
  injectDependencies,
};
