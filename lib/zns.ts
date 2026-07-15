import { ZNS } from 'zcashname-sdk';
import type { Registration, Status } from 'zcashname-sdk';
import { NETWORK } from './api-config';
import { callZnsRpc } from './zns-rpc';

// Server-side only (used by API routes)
// ZNS names are network-specific: mainnet names ≠ testnet names
// Crosslink uses the same ZNS deployment as testnet

const ZNS_URLS: Record<'mainnet' | 'testnet', string> = {
  'mainnet': process.env.ZNS_MAINNET_URL || 'https://light.zcash.me/zns-mainnet-test',
  'testnet': process.env.ZNS_TESTNET_URL || 'https://light.zcash.me/zns-testnet',
};

let client: ZNS | null = null;

function getZnsNetwork(): 'mainnet' | 'testnet' {
  return NETWORK === 'crosslink-testnet' ? 'testnet' : NETWORK;
}

function getZnsUrl(): string {
  return ZNS_URLS[getZnsNetwork()];
}

export function getClient(): ZNS {
  if (!client) {
    const network = getZnsNetwork();
    client = new ZNS({
      url: getZnsUrl(),
      network,
    });
  }
  return client;
}

export function getZnsStatus(signal: AbortSignal): Promise<Status> {
  return callZnsRpc<Status>(getZnsUrl(), 'status', {}, signal);
}

export async function listZnsRegistrations(
  limit: number,
  offset: number,
  signal: AbortSignal,
): Promise<Registration[]> {
  const result = await callZnsRpc<unknown>(
    getZnsUrl(),
    'resolve',
    { query: '', limit, offset },
    signal,
  );
  if (!Array.isArray(result)) {
    throw new Error('ZNS registration response is not an array');
  }
  return result as Registration[];
}

// Client-safe: pure validator, no network or env access.
const validator = new ZNS();
export const isValidName = (name: string): boolean => validator.isValidName(name);
