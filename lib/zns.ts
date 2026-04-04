import { NETWORK } from './api-config';

// Mainnet has no indexer yet
export function isZnsEnabled(): boolean {
  return NETWORK !== 'mainnet';
}
