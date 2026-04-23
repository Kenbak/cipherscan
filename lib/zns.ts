import { ZNS } from 'zcashname-sdk';
import { NETWORK } from './api-config';

// Server-side only (used by API routes)
// ZNS names are network-specific: mainnet names ≠ testnet names
// Crosslink uses the same ZNS deployment as testnet

const ZNS_URLS: Record<'mainnet' | 'testnet', string> = {
  'mainnet': process.env.ZNS_MAINNET_URL || 'https://light.zcash.me/zns-mainnet-test',
  'testnet': process.env.ZNS_TESTNET_URL || 'https://light.zcash.me/zns-testnet',
};

let client: ZNS | null = null;

export function getClient(): ZNS {
  if (!client) {
    const network = NETWORK === 'crosslink-testnet' ? 'testnet' : NETWORK;
    client = new ZNS({
      url: ZNS_URLS[network],
      network,
    });
  }
  return client;
}

// Client-safe: pure validator, no network or env access.
const validator = new ZNS();
export const isValidName = (name: string): boolean => validator.isValidName(name);
