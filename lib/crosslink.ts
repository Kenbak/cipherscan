/**
 * Crosslink Finality Helper
 *
 * Provides optional finality enrichment for blocks and transactions
 * when connected to a zebra-crosslink node. Gracefully returns null
 * when no crosslink RPC is configured (standard Zebra/zcashd).
 *
 * RPC method: get_tfl_block_finality_from_hash (zebra-crosslink custom)
 * Returns: "Finalized" | "NotYetFinalized" | null
 */

import { API_CONFIG } from './api-config';

export type FinalityStatus = 'Finalized' | 'NotYetFinalized' | null;

function getRpcHeaders(): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (API_CONFIG.CROSSLINK_RPC_COOKIE) {
    headers['Authorization'] = `Basic ${Buffer.from(API_CONFIG.CROSSLINK_RPC_COOKIE).toString('base64')}`;
  }

  return headers;
}

/**
 * Fetch finality status for a single block by hash.
 * Returns null when crosslink RPC is not configured or on error.
 */
export async function getBlockFinality(blockHash: string): Promise<FinalityStatus> {
  if (!API_CONFIG.CROSSLINK_RPC_URL) return null;

  try {
    const response = await fetch(API_CONFIG.CROSSLINK_RPC_URL, {
      method: 'POST',
      headers: getRpcHeaders(),
      body: JSON.stringify({
        jsonrpc: '1.0',
        id: `finality-${blockHash}`,
        method: 'get_tfl_block_finality_from_hash',
        params: [blockHash],
      }),
      next: { revalidate: 10 },
    });

    const data = await response.json();
    return (data.result as FinalityStatus) || null;
  } catch (error) {
    console.error('Crosslink finality RPC error:', error);
    return null;
  }
}

/**
 * Fetch finality status for multiple blocks in parallel.
 * Returns a Map of blockHash → FinalityStatus.
 */
export async function getBlocksFinality(
  blocks: { hash: string }[]
): Promise<Map<string, FinalityStatus>> {
  const results = new Map<string, FinalityStatus>();

  if (!API_CONFIG.CROSSLINK_RPC_URL || blocks.length === 0) {
    return results;
  }

  const finalities = await Promise.all(
    blocks.map((block) => getBlockFinality(block.hash))
  );

  blocks.forEach((block, i) => {
    results.set(block.hash, finalities[i]);
  });

  return results;
}
