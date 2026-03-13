import { NextRequest, NextResponse } from 'next/server';

const ZCASH_RPC_URL = process.env.ZCASH_RPC_URL || 'http://localhost:18232';

async function rpcCall(method: string, params: any[] = []) {
  const response = await fetch(ZCASH_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '1.0',
      id: 'mempool-tx',
      method,
      params,
    }),
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.result;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ txid: string }> }
) {
  try {
    const { txid } = await params;
    if (!txid || !/^[a-fA-F0-9]{64}$/.test(txid)) {
      return NextResponse.json({ success: false, error: 'Invalid txid' }, { status: 400 });
    }

    const mempoolTxids: string[] = await rpcCall('getrawmempool');
    if (!mempoolTxids.includes(txid)) {
      return NextResponse.json({ success: true, inMempool: false });
    }

    const tx = await rpcCall('getrawtransaction', [txid, 1]);

    const hasShieldedInputs = (tx.vShieldedSpend?.length > 0) ||
                               (tx.vJoinSplit?.length > 0) ||
                               (tx.orchard?.actions?.length > 0);
    const hasShieldedOutputs = (tx.vShieldedOutput?.length > 0) ||
                                (tx.vJoinSplit?.length > 0) ||
                                (tx.orchard?.actions?.length > 0);
    const hasTransparentInputs = tx.vin?.length > 0 && !tx.vin[0]?.coinbase;
    const hasTransparentOutputs = tx.vout?.length > 0;

    let txType = 'transparent';
    if (hasShieldedInputs || hasShieldedOutputs) {
      txType = (hasTransparentInputs || hasTransparentOutputs) ? 'mixed' : 'shielded';
    }

    const size = tx.hex ? tx.hex.length / 2 : 0;
    const totalOutput = (tx.vout || []).reduce((sum: number, o: any) => sum + (o.value || 0), 0);

    return NextResponse.json({
      success: true,
      inMempool: true,
      transaction: {
        txid: tx.txid,
        size,
        type: txType,
        version: tx.version,
        locktime: tx.locktime,
        firstSeen: Math.floor(Date.now() / 1000),
        vinCount: tx.vin?.length || 0,
        voutCount: tx.vout?.length || 0,
        shieldedSpends: tx.vShieldedSpend?.length || 0,
        shieldedOutputs: tx.vShieldedOutput?.length || 0,
        orchardActions: tx.orchard?.actions?.length || 0,
        totalOutput,
        outputs: (tx.vout || []).map((o: any) => ({
          value: o.value || 0,
          n: o.n,
          address: o.scriptPubKey?.addresses?.[0] || null,
        })),
      },
    });
  } catch (error) {
    console.error('Mempool tx lookup error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to check mempool' },
      { status: 500 }
    );
  }
}
