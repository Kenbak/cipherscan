import type { BridgeData, TransactionData, TxClassification } from './types';

export function classifyTransaction(data: TransactionData): TxClassification {
  const isCoinbase = data.isCoinbase || (data.inputs.length > 0 && data.inputs[0].coinbase);
  const hasIronwood = (data.ironwoodActions || 0) > 0;
  const hasOrchard = (data.orchardActions || 0) > 0;
  const hasSapling = data.hasShieldedData;
  const hasTransparentInputs = data.inputs.length > 0 && !isCoinbase;
  const hasTransparentOutputs = data.outputs.some((o) => o.scriptPubKey?.addresses);
  const hasTransparent = hasTransparentInputs || hasTransparentOutputs;
  const hasShielded = hasIronwood || hasOrchard || hasSapling;

  const hasSaplingSpends = data.saplingSpendCount > 0;
  const hasSaplingOutputs = data.saplingOutputCount > 0;

  const valueBalance =
    (data.valueBalanceSapling || 0) +
    (data.valueBalanceOrchard || 0) +
    (data.valueBalanceIronwood || 0);

  const isShielding = hasTransparentInputs && !hasTransparentOutputs && valueBalance < 0;
  const isUnshielding = !hasTransparentInputs && hasTransparentOutputs && valueBalance > 0;

  const migrationSourcePool =
    hasIronwood && (data.valueBalanceIronwood || 0) !== 0 && !hasTransparent
      ? (data.valueBalanceOrchard || 0) > 0
        ? 'Orchard'
        : (data.valueBalanceSapling || 0) > 0
          ? 'Sapling'
          : null
      : null;
  const isMigration = migrationSourcePool !== null;

  const txType = isCoinbase
    ? 'COINBASE'
    : isMigration
      ? 'MIGRATION'
      : hasIronwood && !hasTransparent
        ? 'IRONWOOD'
        : hasOrchard && !hasTransparent
          ? 'ORCHARD'
          : hasShielded && hasTransparent && isShielding
            ? 'SHIELDING'
            : hasShielded && hasTransparent && isUnshielding
              ? 'UNSHIELDING'
              : hasShielded && hasTransparent
                ? 'MIXED'
                : hasSapling
                  ? 'SHIELDED'
                  : 'REGULAR';

  const allBridges =
    data.bridges && data.bridges.length > 0 ? data.bridges : data.bridge ? [data.bridge] : [];

  const bridgeOutputAddresses = new Map<string, BridgeData>();
  for (const b of allBridges) {
    if (b.zecAddress) bridgeOutputAddresses.set(b.zecAddress, b);
  }

  return {
    isCoinbase,
    hasIronwood,
    hasOrchard,
    hasSapling,
    hasTransparentInputs,
    hasTransparentOutputs,
    hasTransparent,
    hasShielded,
    hasSaplingSpends,
    hasSaplingOutputs,
    valueBalance,
    isShielding,
    isUnshielding,
    migrationSourcePool,
    isMigration,
    txType,
    allBridges,
    bridgeOutputAddresses,
  };
}
