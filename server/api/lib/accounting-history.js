const { blockAccounting, signedZat } = require('./network-accounting');
const { supplyZat } = require('./network-issuance');

// Bound work by height/index, not an unbounded timestamp or transaction scan.
const HISTORY_SQL = `WITH recent AS MATERIALIZED (
  SELECT height, hash, timestamp, size, transaction_count FROM blocks
  WHERE height <= $1 AND ($2::bigint IS NULL OR height < $2)
  ORDER BY height DESC LIMIT $3
) SELECT b.*, a.observed_at, a.chain, a.nsm_balance_zat::text,
  a.circulating_supply_zat::text, a.pool_balances_zat, a.subsidy,
  t.* FROM recent b
  LEFT JOIN node_accounting_observations a ON a.height=b.height AND a.hash=b.hash
  LEFT JOIN LATERAL (
    SELECT count(txid) AS tx_count,
      count(*) FILTER (WHERE is_coinbase) AS coinbases,
      count(*) FILTER (WHERE NOT is_coinbase AND (fee IS NULL OR fee < 0)) AS invalid_fees,
      coalesce(sum(fee) FILTER (WHERE NOT is_coinbase),0)::text AS fees,
      (sum(total_output-value_balance_sapling-value_balance_orchard-value_balance_ironwood)
        FILTER (WHERE is_coinbase))::text AS coinbase_value,
      count(*) FILTER (WHERE version=4) AS v4_transactions,
      sum(sapling_spend_count) AS sapling_spends, sum(sapling_output_count) AS sapling_outputs,
      sum(orchard_actions) AS orchard_actions, sum(ironwood_actions) AS ironwood_actions
    FROM transactions WHERE block_height=b.height AND block_hash=b.hash
  ) t ON true ORDER BY b.height ASC`;

function historyPoints(rows, schedule, chain) {
  return rows.map((row, index) => {
    const matched = row.chain === chain;
    const accounting = blockAccounting(row, matched ? row.subsidy : null, schedule);
    const previous = rows[index - 1];
    const nsm = matched ? signedZat(row.nsm_balance_zat) : null;
    const previousNsm = previous?.chain === chain ? signedZat(previous.nsm_balance_zat) : null;
    const delta = nsm !== null && previousNsm !== null && Number(previous.height) + 1 === Number(row.height)
      ? (BigInt(nsm) - BigInt(previousNsm)).toString() : null;
    const complete = accounting.feesPaidZat !== null;
    return { ...Object.fromEntries(Object.entries(accounting).map(([key, value]) =>
      [key, key.endsWith('Zat') && value !== null ? String(value) : value])),
      timestamp: Number(row.timestamp), sizeBytes: row.size == null ? null : Number(row.size), transactionCount: Number(row.transaction_count),
      nsmBalanceZat: nsm, nsmNetChangeZat: delta,
      circulatingSupplyZat: matched && supplyZat(row.circulating_supply_zat) !== null ? String(row.circulating_supply_zat) : null,
      poolBalancesZat: matched ? row.pool_balances_zat ?? null : null,
      observedAt: matched ? row.observed_at ?? null : null,
      accountingSource: matched && row.observed_at ? 'stored-local-node-tip' : null,
      accountingUnavailableReason: matched && row.observed_at ? null : 'No matching node observation was retained for this block.',
      activity: Object.fromEntries(['v4_transactions', 'sapling_spends', 'sapling_outputs', 'orchard_actions', 'ironwood_actions']
        .map(key => [key, complete && row[key] != null ? Number(row[key]) : null])),
    };
  });
}
module.exports = { HISTORY_SQL, historyPoints };
