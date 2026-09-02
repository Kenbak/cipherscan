'use strict';

/**
 * Minimal read-only JSON-RPC client for Solana.
 *
 * Used only for `getTokenSupply` on SPL token mints. No wallet, no signing,
 * no writes — purely public mint state that anyone could read via solscan.io.
 */

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const MAX_RESPONSE_BYTES = 1 * 1024 * 1024; // 1 MB — response is a tiny fixed-shape object

async function rpcCall(method, params, { timeoutMs = 8000 } = {}) {
  const res = await fetch(SOLANA_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    throw new Error(`Solana RPC HTTP ${res.status}`);
  }

  const contentLength = res.headers.get('content-length');
  if (contentLength && Number(contentLength) > MAX_RESPONSE_BYTES) {
    throw new Error('Solana RPC response too large');
  }

  const json = await res.json();
  if (json.error) {
    throw new Error(json.error.message || 'Solana RPC error');
  }
  return json.result;
}

/**
 * Reads total supply + decimals for an SPL token mint.
 * Read-only — no signing, no state changes.
 */
async function getSplTokenSupply(mintAddress) {
  const result = await rpcCall('getTokenSupply', [mintAddress]);
  const { amount, decimals } = result.value;
  return {
    totalSupplyRaw: BigInt(amount),
    decimals: Number(decimals),
  };
}

module.exports = { getSplTokenSupply };
