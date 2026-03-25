import { createClient, type ZNSClient } from 'zcashname-sdk';
import { NETWORK } from './api-config';
import type { Network } from './api-config';

const ZNS_URLS: Record<Network, string | null> = {
  'mainnet':           null,
  'testnet':           'https://light.zcash.me/zns',
  'crosslink-testnet': 'https://light.zcash.me/zns',
};

const ZNS_URL = process.env.NEXT_PUBLIC_ZNS_URL || ZNS_URLS[NETWORK];

let client: ZNSClient | null = null;

export function isZnsEnabled(): boolean {
  return ZNS_URL !== null;
}

export async function getZnsClient(): Promise<ZNSClient> {
  if (!ZNS_URL) throw new Error('ZNS is not available on this network');
  if (!client) {
    client = await createClient(ZNS_URL);
  }
  return client;
}
