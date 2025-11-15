/**
 * PostgreSQL API Client
 *
 * Functions to interact with the PostgreSQL-backed API
 * for fast, indexed blockchain data access
 */

import { API_CONFIG } from './api-config';

const API_URL = API_CONFIG.POSTGRES_API_URL;

/**
 * Fetch recent blocks from PostgreSQL API
 */
export async function fetchRecentBlocksFromPostgres(limit: number = 10) {
  try {
    const response = await fetch(`${API_URL}/api/blocks?limit=${limit}`, {
      next: { revalidate: 10 }, // Cache for 10 seconds
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();

    // Transform to match the expected format
    return data.blocks.map((block: any) => ({
      height: parseInt(block.height),
      hash: block.hash,
      timestamp: parseInt(block.timestamp),
      transactions: parseInt(block.transaction_count),
      size: parseInt(block.size),
    }));
  } catch (error) {
    console.error('Error fetching blocks from PostgreSQL API:', error);
    throw new Error('Unable to fetch blocks from database');
  }
}

/**
 * Fetch block by height from PostgreSQL API
 */
export async function fetchBlockByHeightFromPostgres(height: number) {
  try {
    const response = await fetch(`${API_URL}/api/block/${height}`, {
      next: { revalidate: 30 }, // Cache based on confirmations (handled by API)
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`API error: ${response.status}`);
    }

    const block = await response.json();

    // Transform transactions to match expected format
    const transactions = (block.transactions || []).map((tx: any) => {
      const isCoinbase = (tx.inputs || []).length === 0 || (tx.inputs || []).every((input: any) => !input.prev_txid);

      // Transform inputs and outputs
      const transformedInputs = isCoinbase
        ? [{ coinbase: true }]
        : (tx.inputs || []).map((input: any) => ({
            ...input,
            value: input.value ? parseFloat(input.value) / 100000000 : 0,
            txid: input.prev_txid,
            vout: input.prev_vout,
          }));

      const transformedOutputs = (tx.outputs || []).map((output: any) => ({
        value: output.value ? parseFloat(output.value) / 100000000 : 0,
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
      };
    });

    return {
      height: parseInt(block.height),
      hash: block.hash,
      time: parseInt(block.timestamp),
      timestamp: parseInt(block.timestamp), // Add timestamp as number for frontend
      tx: transactions,
      transactions: transactions, // Add this for compatibility
      transactionCount: transactions.length, // Add transaction count
      size: parseInt(block.size),
      difficulty: parseFloat(block.difficulty),
      confirmations: parseInt(block.confirmations),
      previousblockhash: block.previous_block_hash,
      nextblockhash: block.next_block_hash,
      previousBlockHash: block.previous_block_hash, // Add camelCase version
      nextBlockHash: block.next_block_hash, // Add camelCase version
      version: parseInt(block.version),
      merkleroot: block.merkle_root,
      merkleRoot: block.merkle_root, // Add camelCase version
      finalsaplingroot: block.final_sapling_root,
      finalSaplingRoot: block.final_sapling_root, // Add camelCase version
      bits: block.bits,
      nonce: block.nonce,
      solution: block.solution,
      totalFees: block.total_fees ? parseInt(block.total_fees) : 0,
      minerAddress: block.miner_address,
    };
  } catch (error) {
    console.error('Error fetching block from PostgreSQL API:', error);
    throw new Error('Unable to fetch block from database');
  }
}

/**
 * Fetch transaction by txid from PostgreSQL API
 */
export async function fetchTransactionFromPostgres(txid: string) {
  try {
    const response = await fetch(`${API_URL}/api/tx/${txid}`, {
      next: { revalidate: 60 }, // Cache for 1 minute
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`API error: ${response.status}`);
    }

    const tx = await response.json();

    // Calculate totals BEFORE transformation (values are in satoshis from API)
    const totalInputsSats = (tx.inputs || []).reduce((sum: number, input: any) => sum + (parseFloat(input.value) || 0), 0);
    const totalOutputsSats = (tx.outputs || []).reduce((sum: number, output: any) => sum + (parseFloat(output.value) || 0), 0);

    // Convert to ZEC
    const totalInput = totalInputsSats / 100000000;
    const totalOutput = totalOutputsSats / 100000000;
    const fee = totalInputsSats > 0 ? (totalInputsSats - totalOutputsSats) / 100000000 : 0;

    // Count shielded components
    const shieldedSpends = (tx.vShieldedSpend || []).length || 0;
    const shieldedOutputs = (tx.vShieldedOutput || []).length || 0;
    const orchardActions = tx.orchard?.actions?.length || 0;

    // Transform inputs and outputs to convert satoshis to ZEC
    const transformedInputs = (tx.inputs || []).map((input: any) => ({
      ...input,
      value: input.value ? parseFloat(input.value) / 100000000 : 0, // Convert satoshis to ZEC
      txid: input.prev_txid,
      vout: input.prev_vout,
    }));

    const transformedOutputs = (tx.outputs || []).map((output: any) => {
      const address = output.address;
      return {
        value: output.value ? parseFloat(output.value) / 100000000 : 0, // Convert satoshis to ZEC
        n: output.vout_index,
        spent: output.spent || false,
        scriptPubKey: {
          hex: output.script_pubkey || '',
          addresses: address ? [address] : [],
        },
      };
    });

    // Check if coinbase (no inputs or all inputs have no prev_txid)
    const isCoinbase = (tx.inputs || []).length === 0 || (tx.inputs || []).every((input: any) => !input.prev_txid);

    // Transform to match the expected format
    return {
      txid: tx.txid,
      hash: tx.txid,
      version: parseInt(tx.version),
      size: parseInt(tx.size),
      locktime: parseInt(tx.locktime),
      vin: isCoinbase ? [{ coinbase: true }] : transformedInputs, // Add coinbase flag if needed
      vout: transformedOutputs,
      inputs: isCoinbase ? [{ coinbase: true }] : transformedInputs, // Add for compatibility
      outputs: transformedOutputs, // Add for compatibility
      timestamp: parseInt(tx.blockTime || tx.block_time), // Add timestamp
      vShieldedSpend: tx.shielded_spends || [],
      vShieldedOutput: tx.shielded_outputs || [],
      valueBalance: parseFloat(tx.value_balance) || 0,
      valueBalanceSapling: parseFloat(tx.value_balance_sapling) || 0,
      valueBalanceOrchard: parseFloat(tx.value_balance_orchard) || 0,
      bindingSig: tx.binding_sig,
      bindingSigSapling: tx.binding_sig_sapling,
      orchard: tx.orchard_actions ? { actions: tx.orchard_actions } : undefined,
      vJoinSplit: tx.joinsplits || [],
      confirmations: parseInt(tx.confirmations) || 0,
      blockheight: parseInt(tx.blockHeight || tx.block_height),
      blockHeight: parseInt(tx.blockHeight || tx.block_height), // Add camelCase version
      blocktime: parseInt(tx.blockTime || tx.block_time),
      blockTime: parseInt(tx.blockTime || tx.block_time), // Add camelCase version
      time: parseInt(tx.blockTime || tx.block_time),
      blockHash: tx.blockHash, // Add block hash
      fee: fee, // Calculated fee in ZEC
      totalInput: totalInput, // Total inputs in ZEC
      totalOutput: totalOutput, // Total outputs in ZEC
      shieldedSpends: shieldedSpends, // Count of shielded spends
      shieldedOutputs: shieldedOutputs, // Count of shielded outputs
      orchardActions: orchardActions, // Count of Orchard actions
      hasShieldedData: tx.hasSapling || tx.has_sapling || shieldedSpends > 0 || shieldedOutputs > 0, // Add hasShieldedData
    };
  } catch (error) {
    console.error('Error fetching transaction from PostgreSQL API:', error);
    throw new Error('Unable to fetch transaction from database');
  }
}

/**
 * Get current block height from PostgreSQL API
 */
export async function getCurrentBlockHeightFromPostgres(): Promise<number | null> {
  try {
    const response = await fetch(`${API_URL}/api/blocks?limit=1`, {
      next: { revalidate: 30 },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.blocks && data.blocks.length > 0) {
      return parseInt(data.blocks[0].height);
    }

    return null;
  } catch (error) {
    console.error('Error fetching current block height:', error);
    return null;
  }
}

/**
 * Fetch address details from PostgreSQL API
 */
export async function fetchAddressFromPostgres(address: string) {
  try {
    const response = await fetch(`${API_URL}/api/address/${address}`, {
      next: { revalidate: 30 }, // Cache for 30 seconds
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();

    // Transform to match the expected format
    return {
      address: data.address,
      type: 'transparent', // All addresses in PostgreSQL are transparent
      balance: data.balance / 100000000, // Convert satoshis to ZEC
      totalReceived: data.totalReceived / 100000000,
      totalSent: data.totalSent / 100000000,
      txCount: data.txCount,
      transactionCount: data.txCount, // Add for compatibility
      transactions: (data.transactions || []).map((tx: any) => {
        const inputValue = tx.inputValue / 100000000;
        const outputValue = tx.outputValue / 100000000;
        const netChange = tx.netChange / 100000000;

        // Determine transaction type and amount
        const isReceived = netChange > 0;
        const isCoinbase = inputValue === 0 && outputValue > 0;

        return {
          txid: tx.txid,
          blockHeight: tx.blockHeight,
          blockTime: tx.blockTime,
          timestamp: tx.blockTime, // Add timestamp for compatibility
          size: tx.size,
          inputValue,
          outputValue,
          netChange,
          // Fields expected by frontend
          amount: Math.abs(netChange), // Absolute value of net change
          type: isReceived ? 'received' : 'sent',
          isCoinbase,
          isShielded: false, // Transparent transactions are not shielded
          from: isCoinbase ? null : (isReceived ? null : data.address),
          to: isCoinbase ? data.address : (isReceived ? data.address : null),
        };
      }),
    };
  } catch (error) {
    console.error('Error fetching address from PostgreSQL API:', error);
    throw new Error('Unable to fetch address from database');
  }
}
