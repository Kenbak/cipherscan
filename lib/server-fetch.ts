import { PHASE_PRODUCTION_BUILD } from 'next/constants';

export const SERVER_RENDER_FETCH_TIMEOUT_MS = 1_000;
export const SERVER_RENDER_BUILD_FETCH_TIMEOUT_MS = 10_000;
/** Local dev often hits a remote API; keep SSR from failing on ~1.5s round trips. */
export const SERVER_RENDER_DEV_FETCH_TIMEOUT_MS = 5_000;

/**
 * Builds need enough time to create the first valid ISR entry from a healthy
 * cross-service API. Runtime requests keep the tighter tail-latency guard.
 * Development uses a longer budget because localhost → remote API is slower
 * than colocated production traffic.
 */
export function getServerRenderFetchTimeoutMs(): number {
  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) {
    return SERVER_RENDER_BUILD_FETCH_TIMEOUT_MS;
  }
  if (process.env.NODE_ENV === 'development') {
    return SERVER_RENDER_DEV_FETCH_TIMEOUT_MS;
  }
  return SERVER_RENDER_FETCH_TIMEOUT_MS;
}

export type NextFetchRequestInit = RequestInit & {
  next?: {
    revalidate?: number | false;
    tags?: string[];
  };
};

type FetchImplementation = (
  input: RequestInfo | URL,
  init?: NextFetchRequestInit,
) => Promise<Response>;

export function isServerRenderDeadlineError(error: unknown): boolean {
  return error instanceof Error && error.name === 'TimeoutError';
}

const SERVICE_API_KEY = process.env.SERVICE_API_KEY || '';

/** Merge the service-key header into the request so server-side fetches
 *  bypass the per-IP rate limiter on the API server. */
function withServiceHeaders(init: NextFetchRequestInit): NextFetchRequestInit {
  if (!SERVICE_API_KEY) return init;
  const headers = new Headers(init.headers);
  if (!headers.has('x-service-key')) headers.set('x-service-key', SERVICE_API_KEY);
  return { ...init, headers };
}

/**
 * Bound upstream work that is allowed to delay server-rendered HTML.
 *
 * Callers either return an unavailable state or throw an availability error,
 * so a slow API cannot hold the page response open until the platform timeout.
 *
 * Automatically injects the SERVICE_API_KEY header so ISR revalidation
 * bypasses the API server's per-IP rate limiter.
 */
export async function fetchWithDeadline(
  input: RequestInfo | URL,
  init: NextFetchRequestInit = {},
  timeoutMs = getServerRenderFetchTimeoutMs(),
  fetchImpl: FetchImplementation = fetch,
): Promise<Response> {
  const mergedInit = withServiceHeaders(init);
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new DOMException('Server-render fetch deadline exceeded', 'TimeoutError'));
  }, Math.max(1, timeoutMs));
  const abortFromCaller = () => controller.abort(mergedInit.signal?.reason);

  if (mergedInit.signal?.aborted) abortFromCaller();
  else mergedInit.signal?.addEventListener('abort', abortFromCaller, { once: true });

  try {
    return await fetchImpl(input, { ...mergedInit, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    mergedInit.signal?.removeEventListener('abort', abortFromCaller);
  }
}
