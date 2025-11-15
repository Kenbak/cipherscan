import { NextRequest, NextResponse } from 'next/server';
import { usePostgresApi } from '@/lib/api-config';
import { fetchTransactionFromPostgres, getCurrentBlockHeightFromPostgres } from '@/lib/postgres-api';

/**
 * API Route: Get transaction by ID
 * GET /api/tx/[txid]
 *
 * CACHE STRATEGY (Etherscan-style):
 * - Confirmed transactions (>10 confirmations): 1 week cache (immutable)
 * - Recent transactions (1-10 confirmations): 1 hour cache (stable)
 * - Unconfirmed/mempool: 30 seconds cache (may change)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ txid: string }> }
) {
  try {
    const { txid } = await params;

    if (!txid || txid.length < 64) {
      return NextResponse.json(
        { error: 'Invalid transaction ID' },
        { status: 400 }
      );
    }

    // Use PostgreSQL API for testnet, RPC for mainnet
    const transaction = usePostgresApi()
      ? await fetchTransactionFromPostgres(txid)
      : await fetchTransaction(txid);

    if (!transaction) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    // Calculate fresh confirmations based on current block height
    let confirmations = transaction.confirmations || 0;

    if (transaction.blockHeight) {
      const currentHeight = usePostgresApi()
        ? await getCurrentBlockHeightFromPostgres()
        : await getCurrentBlockHeight();

      if (currentHeight) {
        confirmations = currentHeight - transaction.blockHeight + 1;
        // Override transaction confirmations with fresh value
        transaction.confirmations = confirmations;
      }
    }
    let cacheMaxAge: number;
    let staleWhileRevalidate: number;

    if (confirmations > 10) {
      // Confirmed transactions are immutable → Cache for 1 week
      cacheMaxAge = 604800; // 7 days
      staleWhileRevalidate = 604800;
    } else if (confirmations > 0) {
      // Recently confirmed → Cache for 1 hour
      cacheMaxAge = 3600; // 1 hour
      staleWhileRevalidate = 7200; // 2 hours
    } else {
      // Unconfirmed/mempool → Cache for 30 seconds
      cacheMaxAge = 30; // 30 seconds
      staleWhileRevalidate = 60; // 1 minute
    }

    return NextResponse.json(transaction, {
      headers: {
        'Cache-Control': `public, s-maxage=${cacheMaxAge}, stale-while-revalidate=${staleWhileRevalidate}`,
        'CDN-Cache-Control': `public, s-maxage=${cacheMaxAge}`,
        'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheMaxAge}`,
        'X-TX-Confirmations': confirmations.toString(),
        'X-Cache-Duration': `${cacheMaxAge}s`,
        'X-Data-Source': usePostgresApi() ? 'postgres' : 'rpc',
      },
    });
  } catch (error) {
    console.error('Error fetching transaction:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transaction' },
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

async function fetchTransaction(txid: string) {
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
    // Get raw transaction
    const txResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '1.0',
        id: 'tx-lookup',
        method: 'getrawtransaction',
        params: [txid, 1], // 1 for verbose output
      }),
    });

    const txData = await txResponse.json();

    if (txData.error || !txData.result) {
      return null;
    }

    const tx = txData.result;

    // Enrich inputs with addresses from previous transactions
    const enrichedInputs = await Promise.all(
      (tx.vin || []).map(async (vin: any) => {
        // Skip coinbase inputs (no previous tx)
        if (vin.coinbase) {
          return { ...vin, address: null, value: 0 };
        }

        try {
          // Fetch the previous transaction
          const prevTxResponse = await fetch(rpcUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              jsonrpc: '1.0',
              id: 'prev-tx',
              method: 'getrawtransaction',
              params: [vin.txid, 1],
            }),
          });

          const prevTxData = await prevTxResponse.json();

          if (prevTxData.error || !prevTxData.result) {
            return { ...vin, address: null, value: 0 };
          }

          // Get the specific output from the previous transaction
          const prevOutput = prevTxData.result.vout[vin.vout];

          return {
            ...vin,
            address: prevOutput?.scriptPubKey?.addresses?.[0] || null,
            value: prevOutput?.value || 0,
          };
        } catch (error) {
          console.error(`Error fetching prev tx ${vin.txid}:`, error);
          return { ...vin, address: null, value: 0 };
        }
      })
    );

    // Calculate total input and output values
    const totalInput = enrichedInputs.reduce((sum: number, vin: any) => {
      return sum + (vin.value || 0);
    }, 0);

    const totalOutput = tx.vout?.reduce((sum: number, vout: any) => {
      return sum + (vout.value || 0);
    }, 0) || 0;

    return {
      txid: tx.txid,
      blockHeight: tx.height,
      blockHash: tx.blockhash,
      timestamp: tx.time,
      confirmations: tx.confirmations,
      inputs: enrichedInputs,
      outputs: tx.vout || [],
      totalInput,
      totalOutput,
      fee: totalInput - totalOutput,
      size: tx.size,
      version: tx.version,
      locktime: tx.locktime,
      // Zcash specific fields
      shieldedSpends: tx.vShieldedSpend?.length || 0,
      shieldedOutputs: tx.vShieldedOutput?.length || 0,
      hasShieldedData: (tx.vShieldedSpend?.length || 0) > 0 || (tx.vShieldedOutput?.length || 0) > 0,
      // Orchard specific fields
      orchardActions: tx.orchard?.actions?.length || 0,
      // Advanced fields (roots, hashes)
      valueBalance: tx.valueBalance,
      valueBalanceSapling: tx.valueBalanceSapling,
      valueBalanceOrchard: tx.valueBalanceOrchard,
      bindingSig: tx.bindingSig,
      bindingSigSapling: tx.bindingSigSapling,
    };
  } catch (error) {
    console.error('Error fetching transaction from RPC:', error);
    return null;
  }
}
