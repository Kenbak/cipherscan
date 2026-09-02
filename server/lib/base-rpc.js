'use strict';

/**
 * Minimal read-only JSON-RPC client for Base (Ethereum L2).
 *
 * Used only for `eth_call` queries against public ERC-20 view functions
 * (e.g. totalSupply/decimals). No wallet, no signing, no writes — this
 * never touches user funds, keys, or addresses. Purely public contract
 * state that anyone could read via basescan.org.
 */

const BASE_RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';

// eth_call responses for view functions are a single 32-byte word (66 chars
// of hex). This just bounds a misbehaving/unexpected response, mirroring
// the response-size caps used for the Zebra RPC client.
const MAX_RESPONSE_BYTES = 1 * 1024 * 1024; // 1 MB

const SELECTORS = {
  totalSupply: '0x18160ddd',
  decimals: '0x313ce567',
};

async function ethCall(to, selector, { timeoutMs = 8000 } = {}) {
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_call',
    params: [{ to, data: selector }, 'latest'],
  });

  const res = await fetch(BASE_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    throw new Error(`Base RPC HTTP ${res.status}`);
  }

  const contentLength = res.headers.get('content-length');
  if (contentLength && Number(contentLength) > MAX_RESPONSE_BYTES) {
    throw new Error('Base RPC response too large');
  }

  const json = await res.json();
  if (json.error) {
    throw new Error(json.error.message || 'Base RPC error');
  }
  return json.result; // hex string, e.g. "0x0000...0f4240"
}

function hexToBigInt(hex) {
  if (!hex || hex === '0x') return 0n;
  return BigInt(hex);
}

/**
 * Reads totalSupply() and decimals() from an ERC-20 contract on Base.
 * Read-only — no signing, no state changes.
 */
async function getErc20Supply(contractAddress) {
  const [supplyHex, decimalsHex] = await Promise.all([
    ethCall(contractAddress, SELECTORS.totalSupply),
    ethCall(contractAddress, SELECTORS.decimals),
  ]);

  return {
    totalSupplyRaw: hexToBigInt(supplyHex),
    decimals: Number(hexToBigInt(decimalsHex)),
  };
}

module.exports = { getErc20Supply };
