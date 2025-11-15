import { NextRequest, NextResponse } from 'next/server';
import { detectAddressType } from '@/lib/zcash';
import { usePostgresApi } from '@/lib/api-config';
import { fetchAddressFromPostgres } from '@/lib/postgres-api';

/**
 * API Route: Get address information
 * GET /api/address/[address]
 *
 * CACHE STRATEGY (Etherscan-style):
 * - Address balance: 30 seconds cache (changes frequently)
 * - Transaction history: 5 minutes cache (new txs are infrequent)
 * - Shielded addresses: 1 hour cache (static response)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;
    const addressType = detectAddressType(address);

    console.log('🔍 [ADDRESS API] Address:', address);
    console.log('🔍 [ADDRESS API] Detected type:', addressType);

    if (addressType === 'invalid') {
      return NextResponse.json(
        { error: 'Invalid Zcash address format' },
        { status: 400 }
      );
    }

    // For shielded addresses, we cannot see balance/transactions (that's the point!)
    if (addressType === 'shielded') {
      // Cache shielded response for 1 hour (static message)
      return NextResponse.json(
        {
          address,
          type: addressType,
          balance: null,
          transactions: [],
          note: 'Shielded address - balance and transactions are private',
        },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
            'CDN-Cache-Control': 'public, s-maxage=3600',
            'X-Cache-Duration': '3600s',
          },
        }
      );
    }

    // For unified addresses, check if they contain a transparent receiver
    if (addressType === 'unified') {
      console.log('🔍 [ADDRESS API] Checking if UA has transparent receiver...');
      const hasTransparent = await checkUnifiedAddressForTransparent(address);
      console.log('🔍 [ADDRESS API] Has transparent receiver:', hasTransparent);

      if (!hasTransparent) {
        console.log('✅ [ADDRESS API] Returning shielded response for fully shielded UA');
        // Fully shielded unified address - treat like a shielded address
        return NextResponse.json(
          {
            address,
            type: 'shielded', // Display as shielded
            balance: null,
            transactions: [],
            note: 'Fully shielded unified address - balance and transactions are private',
          },
          {
            headers: {
              'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
              'CDN-Cache-Control': 'public, s-maxage=3600',
              'X-Cache-Duration': '3600s',
            },
          }
        );
      }
      console.log('🔍 [ADDRESS API] UA has transparent receiver, continuing to fetch data...');
    }

    // For transparent and unified addresses
    // Use PostgreSQL API for testnet, RPC for mainnet
    const data = usePostgresApi()
      ? await fetchAddressFromPostgres(address)
      : await fetchAddressData(address, addressType);

    if (!data) {
      return NextResponse.json(
        { error: 'Address not found' },
        { status: 404 }
      );
    }

    // Cache for 30 seconds (balance changes frequently)
    // Use stale-while-revalidate for better UX
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300',
        'CDN-Cache-Control': 'public, s-maxage=30',
        'Vercel-CDN-Cache-Control': 'public, s-maxage=30',
        'X-Cache-Duration': '30s',
        'X-Data-Source': usePostgresApi() ? 'postgres' : 'rpc',
      },
    });
  } catch (error) {
    console.error('Error fetching address data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch address data' },
      { status: 500 }
    );
  }
}

/**
 * Check if a Unified Address contains a transparent receiver
 */
async function checkUnifiedAddressForTransparent(address: string): Promise<boolean> {
  const rpcUrl = process.env.ZCASH_RPC_URL || 'http://localhost:18232';
  const rpcCookie = process.env.ZCASH_RPC_COOKIE;

  console.log('🔍 [CHECK UA] RPC URL:', rpcUrl);
  console.log('🔍 [CHECK UA] Has cookie:', !!rpcCookie);

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
        id: 'validate-ua',
        method: 'z_validateaddress',
        params: [address],
      }),
    });

    const data = await response.json();
    console.log('🔍 [CHECK UA] RPC Response:', JSON.stringify(data, null, 2));

    if (data.error || !data.result) {
      console.log('❌ [CHECK UA] Error or no result');
      return false;
    }

    // Check if the result contains a transparentaddress field
    const hasTransparent = !!data.result.transparentaddress;
    console.log('🔍 [CHECK UA] transparentaddress field:', data.result.transparentaddress);
    console.log('🔍 [CHECK UA] Has transparent:', hasTransparent);

    return hasTransparent;
  } catch (error) {
    console.error('❌ [CHECK UA] Error validating unified address:', error);
    return false;
  }
}

async function fetchAddressData(address: string, type: string) {
  // Connect to Zebrad node
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
    let queryAddress = address;

    // If unified address, extract the transparent part
    if (type === 'unified') {
      const validateResponse = await fetch(rpcUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '1.0',
          id: 'validate-address',
          method: 'z_validateaddress',
          params: [address],
        }),
      });

      const validateData = await validateResponse.json();

      if (validateData.error) {
        console.error('Error validating unified address:', validateData.error);
        return {
          address,
          type,
          balance: 0,
          transactions: [],
          note: 'Unable to parse unified address',
        };
      }

      // Extract transparent address from the unified address
      const transparentAddress = validateData.result?.transparentaddress;

      if (!transparentAddress) {
        return {
          address,
          type,
          balance: 0,
          transactions: [],
          note: 'This unified address does not contain a transparent receiver. Only transparent balances can be queried.',
        };
      }

      queryAddress = transparentAddress;
      console.log(`Unified address ${address} -> transparent ${transparentAddress}`);
    }

    // Make RPC call to get address info
    // For transparent addresses, we can use getaddressbalance
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '1.0',
        id: 'address-lookup',
        method: 'getaddressbalance',
        params: [{ addresses: [queryAddress] }],
      }),
    });

    if (!response.ok) {
      throw new Error(`RPC request failed: ${response.status}`);
    }

    const rpcData = await response.json();
    console.log('🔍 [FETCH ADDRESS] getaddressbalance response:', JSON.stringify(rpcData, null, 2));

    if (rpcData.error) {
      console.error('❌ [FETCH ADDRESS] RPC Error:', rpcData.error);
      // Return empty data if address not found
      return {
        address,
        type,
        balance: 0,
        transactions: [],
        note: 'Address not found or no transactions yet',
      };
    }

    // Get transactions for this address (with pagination to avoid "Response is too big")
    console.log('🔍 [FETCH ADDRESS] Fetching transactions for:', queryAddress);

    // First, get the blockchain height to calculate pagination
    const heightResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '1.0',
        id: 'get-height',
        method: 'getblockcount',
        params: [],
      }),
    });
    const heightData = await heightResponse.json();
    const currentHeight = heightData.result || 0;

    // Fetch only the most recent 1000 blocks worth of transactions to avoid "Response is too big"
    const startHeight = Math.max(0, currentHeight - 1000);
    const endHeight = currentHeight;

    console.log(`🔍 [FETCH ADDRESS] Fetching txs from block ${startHeight} to ${endHeight}`);

    const txResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '1.0',
        id: 'address-txs',
        method: 'getaddresstxids',
        params: [{
          addresses: [queryAddress],
          start: startHeight,
          end: endHeight
        }],
      }),
    });

    const txData = await txResponse.json();
    console.log('🔍 [FETCH ADDRESS] getaddresstxids response:', txData.error ? `Error: ${txData.error.message}` : `Success: ${txData.result?.length || 0} txs`);
    const txids = txData.result || [];
    console.log('🔍 [FETCH ADDRESS] Found', txids.length, 'transactions');

    // Fetch details for the most recent 25 transactions
    const recentTxids = txids.slice(-25).reverse(); // Get last 25 and reverse (newest first)
    console.log('🔍 [FETCH ADDRESS] Fetching details for', recentTxids.length, 'most recent transactions');

    const transactionDetails = await Promise.all(
      recentTxids.map(async (txid: string) => {
        try {
          const txResponse = await fetch(rpcUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              jsonrpc: '1.0',
              id: 'tx-detail',
              method: 'getrawtransaction',
              params: [txid, 1], // 1 = verbose output
            }),
          });

          const txDetail = await txResponse.json();

          if (txDetail.error || !txDetail.result) {
            return null;
          }

          const tx = txDetail.result;

          // Check if coinbase transaction
          const isCoinbase = tx.vin && tx.vin[0] && tx.vin[0].coinbase;

          // Determine if this address received or sent
          const isReceived = tx.vout.some((out: any) =>
            out.scriptPubKey?.addresses?.includes(queryAddress)
          );

          // Calculate amount for this address
          let amount = 0;
          if (isReceived) {
            // Sum all outputs to this address
            tx.vout.forEach((out: any) => {
              if (out.scriptPubKey?.addresses?.includes(queryAddress)) {
                amount += out.value;
              }
            });
          } else {
            // For sent transactions, sum all outputs NOT to this address
            tx.vout.forEach((out: any) => {
              if (!out.scriptPubKey?.addresses?.includes(queryAddress)) {
                amount += out.value;
              }
            });
          }

          // Get from/to addresses
          let fromAddress = null;
          let toAddress = null;

          if (isCoinbase) {
            // Coinbase: no from address (block reward)
            fromAddress = null;
            toAddress = queryAddress;
          } else if (isReceived) {
            // For received: get first input address (sender)
            if (tx.vin && tx.vin[0]) {
              fromAddress = tx.vin[0].prevout?.scriptPubKey?.addresses?.[0] || null;
            }
            // To is this address
            toAddress = queryAddress;
          } else {
            // For sent: from is this address
            fromAddress = queryAddress;
            // To is first output that's not this address
            const firstOtherOutput = tx.vout.find((out: any) =>
              !out.scriptPubKey?.addresses?.includes(queryAddress)
            );
            toAddress = firstOtherOutput?.scriptPubKey?.addresses?.[0] || null;
          }

          return {
            txid: tx.txid,
            timestamp: tx.time || tx.blocktime || 0,
            amount: amount,
            type: isReceived ? 'received' : 'sent',
            blockHeight: tx.height || null,
            from: fromAddress,
            to: toAddress,
            isCoinbase: isCoinbase,
          };
        } catch (error) {
          console.error(`Error fetching tx ${txid}:`, error);
          return null;
        }
      })
    );

    // Filter out failed fetches
    const validTransactions = transactionDetails.filter(tx => tx !== null);

    // Format the response
    return {
      address,
      type,
      balance: rpcData.result ? rpcData.result.balance / 100000000 : 0, // Convert zatoshi to ZEC
      transactionCount: txids.length,
      transactions: validTransactions,
    };
  } catch (error) {
    console.error('Error connecting to Zcash RPC:', error);

    // Return a fallback response
    return {
      address,
      type,
      balance: 0,
      transactions: [],
      note: 'Unable to connect to Zcash network. Please try again later.',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
