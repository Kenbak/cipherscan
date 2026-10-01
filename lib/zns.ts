import { ZNS } from 'zcashname-sdk';
import { callZnsRpc } from './zns-rpc';
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

export { isValidName } from './name-validation';

// Match the SDK's wire normalization while using an abortable, uncached request.
function normalizeZnsResponse(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeZnsResponse);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
      normalizeZnsResponse(item),
    ]));
  }
  return value;
}

export async function resolveZnsName(name: string, signal: AbortSignal): Promise<Registration | null> {
  const raw = await callZnsRpc<unknown>(getZnsUrl(), 'resolve', { query: name }, signal);
  if (raw === null) return null;
  const result = normalizeZnsResponse(raw) as Registration;
  if (!result || result.name !== name || typeof result.address !== 'string' ||
      !result.address || typeof result.txid !== 'string' || !Number.isInteger(result.height) ||
      typeof result.lastAction !== 'string') throw new Error('Invalid ZNS registration');
  return result;
}

export async function getZnsNameEvents(name: string, signal: AbortSignal): Promise<Awaited<ReturnType<ZNS['events']>>> {
  const raw = await callZnsRpc<unknown>(getZnsUrl(), 'events', { name, limit: 50 }, signal);
  const result = normalizeZnsResponse(raw) as Awaited<ReturnType<ZNS['events']>>;
  if (!result || !Array.isArray(result.events)) throw new Error('Invalid ZNS history');
  return result;
}
