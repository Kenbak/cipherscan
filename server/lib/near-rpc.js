'use strict';

/**
 * Minimal read-only JSON-RPC client for NEAR Protocol.
 *
 * Used only for view-only `call_function` queries against NEP-141
 * (fungible token) contracts — e.g. `ft_total_supply`. No wallet, no
 * signing, no writes — purely public contract state that anyone could
 * read via nearblocks.io.
 */

const NEAR_RPC_URL = process.env.NEAR_RPC_URL || 'https://rpc.mainnet.near.org';
const MAX_RESPONSE_BYTES = 1 * 1024 * 1024; // 1 MB — view-call responses here are tiny

async function viewCall(accountId, methodName, args = {}, { timeoutMs = 8000 } = {}) {
  const argsBase64 = Buffer.from(JSON.stringify(args)).toString('base64');

  const res = await fetch(NEAR_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'query',
      params: {
        request_type: 'call_function',
        finality: 'final',
        account_id: accountId,
        method_name: methodName,
        args_base64: argsBase64,
      },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    throw new Error(`NEAR RPC HTTP ${res.status}`);
  }

  const contentLength = res.headers.get('content-length');
  if (contentLength && Number(contentLength) > MAX_RESPONSE_BYTES) {
    throw new Error('NEAR RPC response too large');
  }

  const json = await res.json();
  if (json.error) {
    throw new Error(json.error.message || 'NEAR RPC error');
  }

  const bytes = Buffer.from(json.result.result);
  return JSON.parse(bytes.toString('utf8'));
}

/**
 * Reads ft_total_supply + ft_metadata (for decimals) from a NEP-141
 * fungible token contract. Read-only — no signing, no state changes.
 */
async function getNep141Supply(accountId) {
  const [totalSupplyStr, metadata] = await Promise.all([
    viewCall(accountId, 'ft_total_supply'),
    viewCall(accountId, 'ft_metadata'),
  ]);

  return {
    totalSupplyRaw: BigInt(totalSupplyStr),
    decimals: Number(metadata.decimals),
  };
}

module.exports = { getNep141Supply };
