export const SERVER_RENDER_FETCH_TIMEOUT_MS = 1_000;

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

/**
 * Bound upstream work that is allowed to delay server-rendered HTML.
 *
 * Callers either return an unavailable state or throw an availability error,
 * so a slow API cannot hold the page response open until the platform timeout.
 */
export async function fetchWithDeadline(
  input: RequestInfo | URL,
  init: NextFetchRequestInit = {},
  timeoutMs = SERVER_RENDER_FETCH_TIMEOUT_MS,
  fetchImpl: FetchImplementation = fetch,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new DOMException('Server-render fetch deadline exceeded', 'TimeoutError'));
  }, Math.max(1, timeoutMs));
  const abortFromCaller = () => controller.abort(init.signal?.reason);

  if (init.signal?.aborted) abortFromCaller();
  else init.signal?.addEventListener('abort', abortFromCaller, { once: true });

  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener('abort', abortFromCaller);
  }
}
