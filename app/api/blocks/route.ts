import { NextRequest, NextResponse } from 'next/server';
import { usePostgresApi } from '@/lib/api-config';
import { fetchRecentBlocksFromPostgres } from '@/lib/postgres-api';
import { getBlocksFinality } from '@/lib/crosslink';

/**
 * API Route: Get recent blocks
 * GET /api/blocks?limit=10
 *
 * CACHE STRATEGY (Etherscan-style):
 * - Latest blocks list: 10 seconds cache
 * - Updates every ~75 seconds (Zcash block time)
 * - Short cache for fresh data on homepage
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    // Use PostgreSQL API for testnet, RPC for mainnet
    const blocks = usePostgresApi()
      ? await fetchRecentBlocksFromPostgres(limit)
      : await fetchRecentBlocks(limit);

    // Enrich with crosslink finality (no-op when not configured)
    const finalityMap = await getBlocksFinality(blocks);
    const enrichedBlocks = blocks.map((block: any) => ({
      ...block,
      finality: finalityMap.get(block.hash) || null,
    }));

    // Cache for 10 seconds (homepage needs fresh data)
    return NextResponse.json(
      { blocks: enrichedBlocks },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
          'CDN-Cache-Control': 'public, s-maxage=10',
          'Vercel-CDN-Cache-Control': 'public, s-maxage=10',
          'X-Cache-Duration': '10s',
          'X-Data-Source': usePostgresApi() ? 'postgres' : 'rpc',
        },
      }
    );
  } catch (error) {
    console.error('Error fetching blocks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch blocks' },
      { status: 500 }
    );
  }
}
async function fetchRecentBlocks(limit: number) {
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
    // First, get the current block height
    const heightResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '1.0',
        id: 'block-height',
        method: 'getblockcount',
        params: [],
      }),
    });

    const heightData = await heightResponse.json();

    if (heightData.error) {
      throw new Error(heightData.error.message);
    }

    const currentHeight = heightData.result;
    const blocks = [];

    // Fetch the last N blocks
    for (let i = 0; i < limit && i < currentHeight; i++) {
      const blockHeight = currentHeight - i;

      // Get block hash
      const hashResponse = await fetch(rpcUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '1.0',
          id: `block-hash-${blockHeight}`,
          method: 'getblockhash',
          params: [blockHeight],
        }),
      });

      const hashData = await hashResponse.json();
      const blockHash = hashData.result;

      // Get block details
      const blockResponse = await fetch(rpcUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '1.0',
          id: `block-${blockHeight}`,
          method: 'getblock',
          params: [blockHash],
        }),
      });

      const blockData = await blockResponse.json();

      if (blockData.result) {
        const block = blockData.result;
        blocks.push({
          height: blockHeight,
          hash: blockHash,
          timestamp: block.time,
          transactions: block.tx ? block.tx.length : 0,
          size: block.size,
          finality: null,
        });
      }
    }

    return blocks;
  } catch (error) {
    console.error('Error fetching blocks from RPC:', error);
    throw new Error('Unable to connect to Zcash node. Please try again later.');
  }
}
