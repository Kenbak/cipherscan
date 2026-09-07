import { ZNS } from 'zcashname-sdk';
import { NETWORK } from './api-config';
import { readApiData, readApiCollection } from './api-client';
import { getApiUrl } from './api-config';

// Infer types from ZNS class methods (SDK no longer exports them directly)
type Registration = NonNullable<Awaited<ReturnType<ZNS['resolveName']>>>;
type Status = Awaited<ReturnType<ZNS['status']>>;

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

export async function getZnsStatus(signal: AbortSignal): Promise<Status> {
  return readApiData<Status>(await fetch(`${getApiUrl()}/v1/names/status`, { signal }));
}
export async function listZnsRegistrations(limit: number, cursor: string | null, signal: AbortSignal) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  return readApiCollection<Registration>(await fetch(`${getApiUrl()}/v1/names?${params}`, { signal }));
}

// Client-safe: pure validator, no network or env access.
const validator = new ZNS();
export const isValidName = (name: string): boolean => validator.isValidName(name);
