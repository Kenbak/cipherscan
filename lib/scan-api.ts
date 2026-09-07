import { ApiError, readApiData } from '@/lib/api-client';

/** Fetch the legacy-supported 50k window in v1's bounded 10k requests. */
export async function fetchCompactScan<T>(
  baseUrl: string, startHeight: number, endHeight: number, signal: AbortSignal,
  onProgress: (fraction: number) => void = () => {},
): Promise<{ blocks: T[] }> {
  const start = Math.max(1, startHeight);
  if (!Number.isSafeInteger(startHeight) || startHeight < 0 || !Number.isSafeInteger(endHeight)
      || endHeight < start || endHeight - start + 1 > 50_000) {
    throw new Error('Choose a scan window of up to 50,000 blocks.');
  }
  const blocks: T[] = [];
  for (let height = start; height <= endHeight; height += 10_000) {
    const last = Math.min(height + 9_999, endHeight);
    let retries = 0;
    while (true) {
      signal.throwIfAborted();
      const response = await fetch(`${baseUrl}/v1/scan/lightwalletd`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
        body: JSON.stringify({ startHeight: height, endHeight: last }),
      });
      try {
        const data = await readApiData<{ blocks: T[] }>(response);
        if (!Array.isArray(data.blocks)) throw new Error('The scan API returned invalid block data.');
        blocks.push(...data.blocks);
        break;
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 429 || retries++ >= 3) throw error;
        const seconds = error.retryAfter ? Number(error.retryAfter) : NaN;
        const delay = Number.isFinite(seconds) ? Math.max(1, seconds) * 1000
          : Math.max(1000, Date.parse(error.retryAfter || '') - Date.now()) || 60_000;
        if (delay > 300_000) throw error; // Do not retry earlier than a long server Retry-After.
        // Aborting while waiting must stop the scan immediately, too.
        await new Promise<void>((resolve, reject) => {
          const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason); };
          const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, delay);
          signal.addEventListener('abort', abort, { once: true });
          if (signal.aborted) abort();
        });
      }
    }
    onProgress((last - start + 1) / (endHeight - start + 1));
  }
  return { blocks };
}
