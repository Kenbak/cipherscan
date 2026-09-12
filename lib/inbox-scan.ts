import type { CompactBlock, ScanMemo, ScanTransaction, MemoOutput } from './scan-records';

const RANGE_SIZE = 10000;
interface Scanner {
  filterCompactBlocks: (blocks: CompactBlock[]) => Promise<ScanTransaction[]>;
  decryptMemos: (transactions: { txid: string; hex: string }[]) => Promise<{ txid: string; outputs: MemoOutput[] }[]>;
}

/** One range ahead, with errors captured immediately so cancellation cannot leak rejections. */
export async function scanInbox(options: {
  apiUrl: string; startHeight: number; endHeight: number; signal: AbortSignal; scanner: Scanner;
  fetcher?: typeof fetch;
  initialize?: () => Promise<void>;
  onProgress: (processed: number, matches: number) => void;
  onMessages: (messages: ScanMemo[]) => void;
}): Promise<{ matches: number; messages: ScanMemo[] }> {
  const { apiUrl, startHeight, endHeight, signal, scanner, onProgress, onMessages } = options;
  const fetcher = options.fetcher || fetch;
  if (!Number.isSafeInteger(startHeight) || !Number.isSafeInteger(endHeight) || startHeight < 1 || endHeight < startHeight) {
    throw new Error('Invalid scan block range');
  }
  async function post(path: string, body: object) {
    signal.throwIfAborted();
    const response = await fetcher(`${apiUrl}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
    });
    if (!response.ok) throw new Error(`Scan request failed (${response.status})`);
    return response.json();
  }
  // Align full requests with the server's disk-cache chunks after the first partial range.
  const rangeEnd = (start: number) => Math.min(endHeight, (Math.floor(start / RANGE_SIZE) + 1) * RANGE_SIZE - 1);
  function fetchRange(start: number) {
    const end = rangeEnd(start);
    return post('/api/lightwalletd/scan', { startHeight: start, endHeight: end, format: 'inbox-v1' })
      .then(data => {
        if (data.format !== undefined && data.format !== 'inbox-v1') throw new Error('Unsupported scan response format');
        const blocks: CompactBlock[] = data.blocks;
        if (data.format === 'inbox-v1' && Array.isArray(blocks) && blocks.some(block =>
          !Array.isArray(block.vtx) || block.vtx.some(tx => typeof tx.records !== 'string' || tx.actions !== undefined))) {
          throw new Error('Invalid packed scan response');
        }
        if (!Array.isArray(blocks) || blocks.length !== end - start + 1 ||
            blocks.some((block, i) => Number(block.height) !== start + i)) {
          throw new Error('Incomplete compact block range; retry the scan');
        }
        return { blocks, error: null };
      }).catch((error: unknown) => ({ blocks: null, error }));
  }
  let pending = fetchRange(startHeight);
  // Download the first range while workers load WASM and prepare their keys.
  // Attach both rejection handlers immediately, including initialization failures.
  const first = Promise.all([pending, options.initialize?.() ?? Promise.resolve()]);
  let matches = 0;
  const messages: ScanMemo[] = [];
  const seen = new Set<string>();
  for (let start = startHeight; start <= endHeight; start = rangeEnd(start) + 1) {
    const range = start === startHeight ? (await first)[0] : await pending;
    signal.throwIfAborted();
    if (!range.blocks) throw range.error;
    const nextStart = rangeEnd(start) + 1;
    if (nextStart <= endHeight) pending = fetchRange(nextStart);
    const matching = await scanner.filterCompactBlocks(range.blocks);
    signal.throwIfAborted();
    const fresh = matching.filter(tx => { if (seen.has(tx.txid)) return false; seen.add(tx.txid); return true; });
    matches += fresh.length;
    for (let offset = 0; offset < fresh.length; offset += 100) {
      const batch = fresh.slice(offset, offset + 100);
      const raw = await post('/api/tx/raw/batch', { txids: batch.map(tx => tx.txid) });
      const byId = new Map<string, string>();
      for (const tx of raw.transactions || []) if (typeof tx.hex === 'string' && tx.hex) byId.set(tx.txid, tx.hex);
      if (batch.some(tx => !byId.has(tx.txid))) throw new Error('Some matching transactions are unavailable; retry the scan');
      const decrypted = await scanner.decryptMemos(batch.map(tx => ({ txid: tx.txid, hex: byId.get(tx.txid)! })));
      signal.throwIfAborted();
      const metadata = new Map(batch.map(tx => [tx.txid, tx]));
      for (const tx of decrypted) for (const output of tx.outputs) messages.push({ ...metadata.get(tx.txid)!, ...output });
      messages.sort((a, b) => b.height - a.height || a.txid.localeCompare(b.txid) || a.output_index - b.output_index);
      onMessages([...messages]);
    }
    onProgress(rangeEnd(start) - startHeight + 1, matches);
  }
  return { matches, messages };
}
