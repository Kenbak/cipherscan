import { createClient, type ZNSClient } from 'zcashname-sdk';
import { NETWORK } from './api-config';
import type { Network } from './api-config';

// Server-side only (used by API routes)

const ZNS_URLS: Record<Network, string> = {
  'mainnet':           'https://light.zcash.me/zns-mainnet-test',
  'testnet':           'https://light.zcash.me/zns-testnet',
  'crosslink-testnet': 'https://light.zcash.me/zns-testnet',
};

const ZNS_URL = process.env.ZNS_URL || ZNS_URLS[NETWORK];

let client: ZNSClient | null = null;

export async function getClient(): Promise<ZNSClient> {
  if (!client) {
    client = await createClient(ZNS_URL);
  }
  return client;
}
