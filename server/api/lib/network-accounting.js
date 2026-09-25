const { supplyZat, subsidyZat } = require('./network-issuance');

// The node's signed NSM counter is not circulating supply. Preserve its integer
// string representation, including negative pre-activation values.
function signedZat(value) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return null;
  if (!['number', 'string'].includes(typeof value) || !/^-?\d+$/.test(String(value))) return null;
  const n = BigInt(value);
  return n >= -(1n << 63n) && n < (1n << 63n) ? n.toString() : null;
}

function blockAccounting(row, subsidy, schedule) {
  const height = Number(row?.height);
  const fees = supplyZat(row?.fees);
  const complete = row && Number(row.tx_count) === Number(row.transaction_count) && Number(row.coinbases) === 1 && Number(row.invalid_fees) === 0;
  const paid = complete ? fees : null;
  const active = schedule ? schedule.nu7Height !== null && height >= schedule.nu7Height : null;
  const recycled = paid === null || active === null ? null : active ? Number(BigInt(paid) * 3n / 5n) : 0;
  const minerFees = recycled === null ? null : paid - recycled;
  const minerSubsidy = subsidyZat(subsidy?.miner);
  const founders = subsidyZat(subsidy?.founders);
  const funding = subsidyZat(subsidy?.fundingstreamstotal);
  // Coinbase transparent outputs plus net shielded creation, less compulsory
  // non-miner payouts. Lockbox allocations are not spendable coinbase outputs.
  const coinbase = supplyZat(row?.coinbase_value);
  const receipts = complete && coinbase !== null && founders !== null && funding !== null && coinbase >= founders + funding
    ? coinbase - founders - funding : null;
  return { height, hash: row?.hash ?? null, feesPaidZat: paid, feesToNsmZat: recycled,
    minerFeeAllocationZat: minerFees, minerSubsidyZat: minerSubsidy, minerReceiptsZat: receipts,
    feeRule: active === null ? 'unavailable' : active ? 'floor(aggregate-block-fees * 3 / 5)' : 'pre-NU7',
    reissuanceZat: null, reissuanceUnavailableReason: 'No separate authoritative reissuance field in this RPC release.',
    unavailableReason: !complete || paid === null ? 'Incomplete indexed block accounting.' : null };
}

module.exports = { signedZat, blockAccounting };
