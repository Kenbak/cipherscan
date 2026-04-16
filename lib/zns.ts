import { ZNS } from 'zcashname-sdk';
import { NETWORK } from './api-config';
import type { Network } from './api-config';

// Server-side only (used by API routes)

const ZNS_URLS: Record<Network, string> = {
  'mainnet':           process.env.ZNS_MAINNET_URL || 'https://light.zcash.me/zns-mainnet-test',
  'testnet':           process.env.ZNS_TESTNET_URL || 'https://light.zcash.me/zns-testnet',
  'crosslink-testnet': process.env.ZNS_TESTNET_URL || 'https://light.zcash.me/zns-testnet',
};

const ZNS_NETWORKS: Record<Network, 'mainnet' | 'testnet'> = {
  'mainnet': 'mainnet',
  'testnet': 'testnet',
  'crosslink-testnet': 'testnet',
};

let client: ZNS | null = null;

export function getClient(): ZNS {
  if (!client) {
    client = new ZNS({
      url: ZNS_URLS[NETWORK],
      network: ZNS_NETWORKS[NETWORK],
    });
  }
  return client;
}
