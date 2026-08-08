import { zatToZec } from '@/lib/format-numbers';
import type { TransactionData } from './types';

export function transformExpressTxData(txData: any): TransactionData {
  const transformedInputs = (txData.inputs || []).map((input: any) => ({
    ...input,
    value: input.value ? zatToZec(input.value) : 0,
    txid: input.prev_txid,
    vout: input.prev_vout,
  }));

  const transformedOutputs = (txData.outputs || []).map((output: any) => ({
    value: output.value ? zatToZec(output.value) : 0,
    n: output.vout_index,
    spent: output.spent || false,
    scriptPubKey: {
      hex: output.script_pubkey || '',
      addresses: output.address ? [output.address] : [],
    },
  }));

  const transparentInputSum = transformedInputs.reduce(
    (sum: number, i: any) => sum + (i.value || 0),
    0,
  );
  const transparentOutputSum = transformedOutputs.reduce(
    (sum: number, o: any) => sum + (o.value || 0),
    0,
  );

  const transformedData: TransactionData = {
    txid: txData.txid,
    status: txData.status,
    isCanonical: txData.isCanonical,
    blockHeight: txData.blockHeight,
    blockHash: txData.blockHash,
    timestamp: parseInt(txData.blockTime),
    confirmations: parseInt(txData.confirmations),
    inputs: transformedInputs,
    outputs: transformedOutputs,
    totalInput: txData.totalInput != null ? txData.totalInput : transparentInputSum,
    totalOutput: txData.totalOutput != null ? txData.totalOutput : transparentOutputSum,
    fee: 0,
    size: parseInt(txData.size),
    version: parseInt(txData.version),
    locktime: parseInt(txData.locktime),
    expiryHeight: txData.expiryHeight ? parseInt(txData.expiryHeight) : null,
    saplingSpendCount: txData.saplingSpendCount || 0,
    saplingOutputCount: txData.saplingOutputCount || 0,
    hasShieldedData: txData.hasSapling || txData.hasShielded || txData.hasIronwood || false,
    isCoinbase: txData.isCoinbase || false,
    orchardActions: txData.orchardActions || 0,
    ironwoodActions: txData.ironwoodActions || 0,
    valueBalance: parseFloat(txData.valueBalance || 0),
    valueBalanceSapling: parseFloat(txData.valueBalanceSapling || 0),
    valueBalanceOrchard: parseFloat(txData.valueBalanceOrchard || 0),
    valueBalanceIronwood: parseFloat(txData.valueBalanceIronwood || 0),
    bindingSig: txData.bindingSig,
    bindingSigSapling: txData.bindingSigSapling,
    finality: txData.finality || null,
    bridge: txData.bridge || null,
    bridges: txData.bridges || [],
    stakingAction: txData.stakingAction || null,
    coinbaseHex: txData.coinbaseHex || null,
    coinbaseText: txData.coinbaseText || null,
    zip318: txData.zip318 || null,
  };

  if (txData.fee && txData.fee > 0) {
    transformedData.fee = txData.fee;
  } else {
    const shieldedValueBalance =
      (transformedData.valueBalanceSapling || 0) +
      (transformedData.valueBalanceOrchard || 0) +
      (transformedData.valueBalanceIronwood || 0);
    const calculatedFee =
      transformedData.totalInput - transformedData.totalOutput + shieldedValueBalance;
    transformedData.fee = calculatedFee > 0 ? calculatedFee : 0;
  }

  return transformedData;
}
