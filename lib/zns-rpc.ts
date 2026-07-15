interface JsonRpcError {
  code?: number;
  message?: string;
}

interface JsonRpcEnvelope<Result> {
  error?: JsonRpcError;
  result?: Result;
}

type FetchImplementation = typeof fetch;

/** Perform one abortable request against a fixed, caller-selected ZNS URL. */
export async function callZnsRpc<Result>(
  url: string,
  method: string,
  params: Record<string, unknown>,
  signal: AbortSignal,
  fetchImplementation: FetchImplementation = fetch,
): Promise<Result> {
  const response = await fetchImplementation(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    cache: 'no-store',
    signal,
  });

  if (!response.ok) {
    throw new Error(`ZNS HTTP ${response.status}: ${response.statusText}`);
  }

  const parsed: unknown = await response.json();
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('ZNS returned an invalid JSON-RPC response');
  }

  const envelope = parsed as JsonRpcEnvelope<Result>;
  if (envelope.error) {
    throw new Error(
      `ZNS RPC error ${envelope.error.code ?? 'unknown'}: ${envelope.error.message ?? 'unknown error'}`,
    );
  }
  if (!Object.prototype.hasOwnProperty.call(envelope, 'result')) {
    throw new Error('ZNS JSON-RPC response is missing a result');
  }

  return envelope.result as Result;
}
