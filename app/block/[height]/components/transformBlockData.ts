import { zatToZec } from '@/lib/format-numbers';
import type { BlockData, CanonicalBlockSummary } from './types';

export function transformExpressBlockData(blockData: any): BlockData {
  const transformedTransactions = (blockData.transactions || []).map((tx: any) => {
    const hasShieldedActivity = tx.has_sapling || tx.has_orchard || tx.has_ironwood ||
      (tx.sapling_spend_count > 0) || (tx.sapling_output_count > 0) || (tx.orchard_actions > 0) || (tx.ironwood_actions > 0);

    const isCoinbase = !hasShieldedActivity &&
      ((tx.inputs || []).length === 0 || (tx.inputs || []).every((input: any) => !input.prev_txid));

    const transformedInputs = isCoinbase
      ? [{ coinbase: true }]
      : (tx.inputs || []).map((input: any) => ({
          ...input,
          value: input.value ? zatToZec(input.value) : 0,
          txid: input.prev_txid,
          vout: input.prev_vout,
        }));

    const transformedOutputs = (tx.outputs || []).map((output: any) => ({
      value: output.value ? zatToZec(output.value) : 0,
      n: output.vout_index,
      spent: output.spent || false,
      scriptPubKey: {
        hex: output.script_pubkey || '',
        addresses: output.address ? [output.address] : [],
      },
    }));

    return {
      ...tx,
      inputs: transformedInputs,
      outputs: transformedOutputs,
      vin: transformedInputs,
      vout: transformedOutputs,
      hasShieldedActivity,
      vShieldedSpend: tx.sapling_spend_count > 0 ? Array(tx.sapling_spend_count).fill({}) : [],
      vShieldedOutput: tx.sapling_output_count > 0 ? Array(tx.sapling_output_count).fill({}) : [],
      orchard: tx.orchard_actions > 0 ? { actions: Array(tx.orchard_actions).fill({}) } : null,
    };
  });

  const calculatedFees = (blockData.transactions || []).reduce((sum: number, tx: any) => {
    const isCoinbaseTx = tx.tx_index === 0;
    if (isCoinbaseTx) return sum;

    const transparentInputs = (tx.inputs || []).reduce((inputSum: number, input: any) => {
      return inputSum + parseInt(input.value || 0);
    }, 0);

    const transparentOutputs = (tx.outputs || []).reduce((outputSum: number, output: any) => {
      return outputSum + parseInt(output.value || 0);
    }, 0);

    const valueBalance = parseInt(tx.value_balance_sapling || 0) + parseInt(tx.value_balance_orchard || 0) + parseInt(tx.value_balance_ironwood || 0);

    const txFee = transparentInputs - transparentOutputs + valueBalance;
    return sum + (txFee > 0 ? txFee : 0);
  }, 0);

  const totalFeesZatoshi = calculatedFees;

  const canonicalBlock: CanonicalBlockSummary | null = blockData.canonicalBlock
    ? {
        height: parseInt(blockData.canonicalBlock.height),
        hash: blockData.canonicalBlock.hash,
        timestamp: blockData.canonicalBlock.timestamp
          ? parseInt(blockData.canonicalBlock.timestamp)
          : null,
        transactionCount: blockData.canonicalBlock.transaction_count ?? null,
        size: blockData.canonicalBlock.size ?? null,
        minerAddress: blockData.canonicalBlock.miner_address || null,
        minerPool: blockData.canonicalBlock.miner_pool || null,
        minerPoolUrl: blockData.canonicalBlock.miner_pool_url || null,
        minerPoolRegion: blockData.canonicalBlock.miner_pool_region || null,
      }
    : null;

  return {
    height: parseInt(blockData.height),
    hash: blockData.hash,
    timestamp: blockData.timestamp ? parseInt(blockData.timestamp) : 0,
    transactions: transformedTransactions,
    transactionCount: blockData.transactionCount || transformedTransactions.length,
    size: parseInt(blockData.size || 0),
    difficulty: blockData.difficulty ? parseFloat(blockData.difficulty) : 0,
    confirmations: parseInt(blockData.confirmations || 0),
    previousBlockHash: blockData.previous_block_hash || blockData.previousBlockHash,
    nextBlockHash: blockData.next_block_hash || blockData.nextBlockHash,
    version: blockData.version ? parseInt(blockData.version) : undefined,
    merkleRoot: blockData.merkle_root || blockData.merkleRoot,
    finalSaplingRoot: blockData.final_sapling_root || blockData.finalSaplingRoot,
    finalOrchardRoot: blockData.final_orchard_root || blockData.finalOrchardRoot || null,
    finalIronwoodRoot: blockData.final_ironwood_root || blockData.finalIronwoodRoot || null,
    bits: blockData.bits,
    nonce: blockData.nonce,
    solution: blockData.solution,
    totalFees: zatToZec(totalFeesZatoshi),
    minerAddress: blockData.miner_address || blockData.minerAddress,
    minerPool: blockData.miner_pool || null,
    minerPoolUrl: blockData.miner_pool_url || null,
    minerPoolRegion: blockData.miner_pool_region || null,
    finality: blockData.finality || blockData.finality_status || null,
    isOrphaned: Boolean(blockData.isOrphaned),
    orphanSource: blockData.orphanSource || null,
    orphanDetectedAt: blockData.orphanDetectedAt || null,
    canonicalBlock,
    coinbaseHex: blockData.coinbase_hex || null,
    coinbaseText: blockData.coinbase_text || null,
  };
}
