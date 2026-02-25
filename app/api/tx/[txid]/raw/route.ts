import { NextRequest, NextResponse } from 'next/server';
import { usePostgresApi } from '@/lib/api-config';

const ZCASH_RPC_URL = process.env.ZCASH_RPC_URL || 'http://localhost:18232';

/**
 * API Route: Get raw transaction hex
 * GET /api/tx/[txid]/raw
 *
 * Returns { hex: "..." } for the given txid.
 * Used by CipherPay for trial decryption of shielded transactions.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ txid: string }> }
) {
  try {
    const { txid } = await params;

    if (!txid || !/^[a-fA-F0-9]{64}$/.test(txid)) {
      return NextResponse.json(
        { error: 'Invalid transaction ID' },
        { status: 400 }
      );
    }

    let hex: string | null = null;

    if (usePostgresApi()) {
      hex = await fetchRawHexFromPostgres(txid);
    }

    if (!hex) {
      hex = await fetchRawHexFromRpc(txid);
    }

    if (!hex) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { txid, hex },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        },
      }
    );
  } catch (error) {
    console.error('Error fetching raw transaction:', error);
    return NextResponse.json(
      { error: 'Failed to fetch raw transaction' },
      { status: 500 }
    );
  }
}

async function fetchRawHexFromRpc(txid: string): Promise<string | null> {
  const rpcCookie = process.env.ZCASH_RPC_COOKIE;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (rpcCookie) {
    headers['Authorization'] = `Basic ${Buffer.from(rpcCookie).toString('base64')}`;
  }

  try {
    const response = await fetch(ZCASH_RPC_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '1.0',
        id: 'raw-tx',
        method: 'getrawtransaction',
        params: [txid, 0],
      }),
    });

    const data = await response.json();

    if (data.error || !data.result) {
      return null;
    }

    return data.result;
  } catch (error) {
    console.error('Error fetching raw tx from RPC:', error);
    return null;
  }
}

async function fetchRawHexFromPostgres(txid: string): Promise<string | null> {
  const apiUrl = process.env.CIPHERSCAN_API_URL || process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return null;

  try {
    const response = await fetch(`${apiUrl}/api/tx/${txid}`, {
      next: { revalidate: 60 },
    });

    if (!response.ok) return null;

    const tx = await response.json();
    return tx.raw_hex || null;
  } catch {
    return null;
  }
}
