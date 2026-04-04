import { createClient, type ZNSClient } from 'zcashname-sdk';
import { NETWORK } from './api-config';
import type { Network } from './api-config';

// Server-side only (used by API routes)

const ZNS_URLS: Record<Network, string> = {
  'mainnet':           process.env.ZNS_MAINNET_URL || 'https://light.zcash.me/zns-mainnet-test',
  'testnet':           process.env.ZNS_TESTNET_URL || 'https://light.zcash.me/zns-testnet',
  'crosslink-testnet': process.env.ZNS_TESTNET_URL || 'https://light.zcash.me/zns-testnet',
};

let client: ZNSClient | null = null;

export async function getClient(): Promise<ZNSClient> {
  if (!client) {
    client = await createClient(ZNS_URLS[NETWORK]);
  }
  return client;
}
