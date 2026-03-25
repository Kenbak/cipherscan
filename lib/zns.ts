import { createClient, type ZNSClient } from 'zcashname-sdk';
import { NETWORK } from './api-config';
import type { Network } from './api-config';

const ZNS_URLS: Record<Network, string> = {
  'mainnet':           'https://names.zcash.me',
  'testnet':           'https://names.zcash.me',
  'crosslink-testnet': 'https://names.zcash.me',
};

const ZNS_URL = process.env.NEXT_PUBLIC_ZNS_URL || ZNS_URLS[NETWORK];

let client: ZNSClient | null = null;

export async function getZnsClient(): Promise<ZNSClient> {
  if (!client) {
    client = await createClient(ZNS_URL);
  }
  return client;
}
