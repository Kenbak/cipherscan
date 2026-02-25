import { NextRequest, NextResponse } from 'next/server';
import { usePostgresApi } from '@/lib/api-config';
import { fetchBlockByHeightFromPostgres, getCurrentBlockHeightFromPostgres } from '@/lib/postgres-api';
import { getBlockFinality } from '@/lib/crosslink';

/**
 * API Route: Get block by height
 * GET /api/block/[height]
 *
 * CACHE STRATEGY (Etherscan-style):
 * - Old blocks (>100 confirmations): 1 week cache (immutable)
 * - Recent blocks (10-100 confirmations): 1 hour cache (stable)
 * - Latest blocks (<10 confirmations): 30 seconds cache (may reorg)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ height: string }> }
) {
  try {
    const { height: heightStr } = await params;
    const isHash = /^[a-fA-F0-9]{64}$/.test(heightStr);
    const height = isHash ? null : parseInt(heightStr, 10);

    if (!isHash && isNaN(height!)) {
      return NextResponse.json(
        { error: 'Invalid block height or hash' },
        { status: 400 }
      );
    }

    // Fetch block by hash or height
    let block;
    if (isHash) {
      block = usePostgresApi()
        ? await fetchBlockByHeightFromPostgres(heightStr)
        : await fetchBlockByHash(heightStr);
    } else {
      block = usePostgresApi()
        ? await fetchBlockByHeightFromPostgres(height!)
        : await fetchBlockByHeight(height!);
    }

    // Get current block height to calculate confirmations
    const blockHeight = block?.height ?? height;
    const currentHeight = usePostgresApi()
      ? await getCurrentBlockHeightFromPostgres()
      : await getCurrentBlockHeight();
    const confirmations = (currentHeight && blockHeight) ? currentHeight - blockHeight + 1 : 1;

    if (!block) {
      return NextResponse.json(
        { error: 'Block not found' },
        { status: 404 }
      );
    }

    // Override confirmations with freshly calculated value
    block.confirmations = confirmations;

    // Enrich with crosslink finality (returns null when not configured)
    if (block.hash) {
      const finality = await getBlockFinality(block.hash);
      if (finality) {
        block.finality = finality;
      }
    }

    // Determine cache duration based on confirmations (Etherscan strategy)
    let cacheMaxAge: number;
    let staleWhileRevalidate: number;

    if (confirmations > 100) {
      // Old blocks are immutable → Cache for 1 week
      cacheMaxAge = 604800; // 7 days
      staleWhileRevalidate = 604800;
    } else if (confirmations > 10) {
      // Semi-recent blocks are very stable → Cache for 1 hour
      cacheMaxAge = 3600; // 1 hour
      staleWhileRevalidate = 7200; // 2 hours
    } else {
      // Recent blocks may reorganize → Cache for 30 seconds
      cacheMaxAge = 30; // 30 seconds
      staleWhileRevalidate = 60; // 1 minute
    }

    // Return with cache headers
    return NextResponse.json(block, {
      headers: {
        'Cache-Control': `public, s-maxage=${cacheMaxAge}, stale-while-revalidate=${staleWhileRevalidate}`,
        'CDN-Cache-Control': `public, s-maxage=${cacheMaxAge}`,
        'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheMaxAge}`,
        'X-Block-Confirmations': confirmations.toString(),
        'X-Cache-Duration': `${cacheMaxAge}s`,
        'X-Data-Source': usePostgresApi() ? 'postgres' : 'rpc',
      },
    });
  } catch (error) {
    console.error('Error fetching block:', error);
    return NextResponse.json(
      { error: 'Failed to fetch block' },
      { status: 500 }
    );
  }
}

// Helper function to get current block height
async function getCurrentBlockHeight(): Promise<number | null> {
  const rpcUrl = process.env.ZCASH_RPC_URL || 'http://localhost:18232';
  const rpcCookie = process.env.ZCASH_RPC_COOKIE;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (rpcCookie) {
    headers['Authorization'] = `Basic ${Buffer.from(rpcCookie).toString('base64')}`;
  }

  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '1.0',
        id: 'blockcount',
        method: 'getblockcount',
        params: [],
      }),
      // Cache for 30 seconds (blocks are mined ~every 75s on Zcash)
      next: { revalidate: 30 },
    });

    const data = await response.json();
    return data.result || null;
  } catch (error) {
    console.error('Error fetching current block height:', error);
    return null;
  }
}

async function fetchBlockByHeight(height: number) {
  const rpcUrl = process.env.ZCASH_RPC_URL || 'http://localhost:18232';
  const rpcCookie = process.env.ZCASH_RPC_COOKIE;

  // Prepare headers with optional cookie auth
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (rpcCookie) {
    headers['Authorization'] = `Basic ${Buffer.from(rpcCookie).toString('base64')}`;
  }

  try {
    // Get block hash
    const hashResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '1.0',
        id: 'block-hash',
        method: 'getblockhash',
        params: [height],
      }),
    });

    const hashData = await hashResponse.json();

    if (hashData.error) {
      return null;
    }

    const blockHash = hashData.result;

    // Get block details
    const blockResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '1.0',
        id: 'block-data',
        method: 'getblock',
        params: [blockHash, 2], // verbosity 2 for full transaction details
      }),
    });

    const blockData = await blockResponse.json();

    if (blockData.error || !blockData.result) {
      return null;
    }

    const block = blockData.result;

    // Calculate total fees (sum of all tx fees in the block)
    let totalFees = 0;
    let minerAddress = null;

    if (block.tx && block.tx.length > 0) {
      // First transaction is always coinbase (miner reward)
      const coinbaseTx = block.tx[0];

      // Get miner address from coinbase vout
      if (coinbaseTx.vout && coinbaseTx.vout.length > 0) {
        const firstOutput = coinbaseTx.vout[0];
        if (firstOutput.scriptPubKey && firstOutput.scriptPubKey.addresses) {
          minerAddress = firstOutput.scriptPubKey.addresses[0];
        }
      }

      // Enrich transactions with first input address (for FROM display)
      // Only fetch for non-coinbase transactions
      for (let i = 1; i < block.tx.length; i++) {
        const tx = block.tx[i];

        // Skip if no inputs or is coinbase
        if (!tx.vin || tx.vin.length === 0 || tx.vin[0].coinbase) {
          continue;
        }

        // Fetch the first input's previous transaction to get the address
        const firstInput = tx.vin[0];

        try {
          const prevTxResponse = await fetch(rpcUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              jsonrpc: '1.0',
              id: `prev-tx-${i}`,
              method: 'getrawtransaction',
              params: [firstInput.txid, 1], // verbosity 1 for decoded
            }),
          });

          const prevTxData = await prevTxResponse.json();

          if (prevTxData.result && prevTxData.result.vout) {
            const prevOutput = prevTxData.result.vout[firstInput.vout];

            if (prevOutput && prevOutput.scriptPubKey && prevOutput.scriptPubKey.addresses) {
              // Add the address to the first input
              tx.vin[0].address = prevOutput.scriptPubKey.addresses[0];
              tx.vin[0].value = prevOutput.value;
            }
          }
        } catch (error) {
          // Silently fail - input address will remain undefined
          console.error(`Failed to fetch input address for tx ${tx.txid}:`, error);
        }
      }

      // TODO: Implement proper fee calculation by fetching previous TX outputs
      // For now, set to 0 or undefined
      totalFees = 0;
    }

    return {
      height: block.height,
      hash: block.hash,
      timestamp: block.time,
      transactions: block.tx || [],
      transactionCount: block.tx ? block.tx.length : 0,
      size: block.size,
      difficulty: block.difficulty,
      confirmations: block.confirmations,
      previousBlockHash: block.previousblockhash,
      nextBlockHash: block.nextblockhash,
      version: block.version,
      merkleRoot: block.merkleroot,
      finalSaplingRoot: block.finalsaplingroot,
      bits: block.bits,
      nonce: block.nonce,
      solution: block.solution,
      totalFees: totalFees > 0 ? totalFees : undefined,
      minerAddress,
      finality: null as string | null,
    };
  } catch (error) {
    console.error('Error fetching block from RPC:', error);
    return null;
  }
}

async function fetchBlockByHash(hash: string) {
  const rpcUrl = process.env.ZCASH_RPC_URL || 'http://localhost:18232';
  const rpcCookie = process.env.ZCASH_RPC_COOKIE;

  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (rpcCookie) {
    headers['Authorization'] = `Basic ${Buffer.from(rpcCookie).toString('base64')}`;
  }

  try {
    const blockResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '1.0',
        id: 'block-by-hash',
        method: 'getblock',
        params: [hash, 2],
      }),
    });

    const blockData = await blockResponse.json();
    if (blockData.error || !blockData.result) return null;

    const block = blockData.result;
    let minerAddress = null;

    if (block.tx?.length > 0) {
      const coinbaseTx = block.tx[0];
      if (coinbaseTx.vout?.[0]?.scriptPubKey?.addresses) {
        minerAddress = coinbaseTx.vout[0].scriptPubKey.addresses[0];
      }
    }

    return {
      height: block.height,
      hash: block.hash,
      timestamp: block.time,
      transactions: block.tx || [],
      transactionCount: block.tx ? block.tx.length : 0,
      size: block.size,
      difficulty: block.difficulty,
      confirmations: block.confirmations,
      previousBlockHash: block.previousblockhash,
      nextBlockHash: block.nextblockhash,
      version: block.version,
      merkleRoot: block.merkleroot,
      finalSaplingRoot: block.finalsaplingroot,
      bits: block.bits,
      nonce: block.nonce,
      solution: block.solution,
      minerAddress,
      finality: null as string | null,
    };
  } catch (error) {
    console.error('Error fetching block by hash from RPC:', error);
    return null;
  }
}
