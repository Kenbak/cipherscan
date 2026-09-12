import { compactTxIdToDisplay } from './scan-records';
import { readCompactRange } from './scan-stream';
import type { CompactBlock, ScanMemo, ScanTransaction, MemoOutput } from './scan-records';

const RANGE_SIZE = 10000;
type DecryptedTransaction = { txid: string; outputs: MemoOutput[] };
export type ScanPhase = 'fetching' | 'filtering' | 'memos' | 'decrypting';
interface Scanner {
  filterCompactBlocks: (blocks: CompactBlock[]) => Promise<ScanTransaction[]>;
  decryptMemos: (transactions: { txid: string; hex: string }[], onTransaction?: (transaction: DecryptedTransaction) => void) => Promise<DecryptedTransaction[]>;
}

/** One streamed batch ahead, with errors captured immediately. */
export async function scanInbox(options: {
  apiUrl: string; startHeight: number; endHeight: number; signal: AbortSignal; scanner: Scanner;
  fetcher?: typeof fetch;
  initialize?: () => Promise<void>;
  onPhase?: (phase: ScanPhase) => void;
  onProgress: (processed: number, matches: number) => void;
  onMessages: (messages: ScanMemo[]) => void;
}): Promise<{ matches: number; messages: ScanMemo[] }> {
  const { apiUrl, startHeight, endHeight, scanner, onProgress, onMessages } = options;
  const fetcher = options.fetcher || fetch;
  if (!Number.isSafeInteger(startHeight) || !Number.isSafeInteger(endHeight) || startHeight < 1 || endHeight < startHeight) {
    throw new Error('Invalid scan block range');
  }
  const controller = new AbortController();
  const signal = controller.signal;
  const abort = () => controller.abort();
  options.signal.addEventListener('abort', abort, { once: true });
  if (options.signal.aborted) abort();
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
  async function* ranges() {
    let previousHash: string | undefined;
    for (let start = startHeight; start <= endHeight; start = rangeEnd(start) + 1) {
      signal.throwIfAborted();
      const end = rangeEnd(start);
      const response = await fetcher(`${apiUrl}/api/lightwalletd/scan`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startHeight: start, endHeight: end, format: 'inbox-stream-v1' }), signal,
      });
      for await (const blocks of readCompactRange(response, start, end, signal, previousHash)) {
        previousHash = blocks.at(-1)?.hash;
        yield blocks;
      }
    }
  }
  const iterator = ranges();
  const next = () => iterator.next().then(value => ({ value, error: null })).catch((error: unknown) => ({ value: null, error }));
  let pending = next();
  let initialized = false;
  let matches = 0;
  const messages: ScanMemo[] = [];
  const seen = new Set<string>();
  let lastPublish = -Infinity;
  let dirty = false;
  const flushMessages = () => {
    if (!dirty) return;
    signal.throwIfAborted();
    messages.sort((a, b) => b.height - a.height || a.txid.localeCompare(b.txid) || a.output_index - b.output_index);
    onMessages([...messages]);
    lastPublish = Date.now();
    dirty = false;
  };
  // Memo I/O must not pause compact filtering at each stream frame. Keep at
  // most 200 queued IDs, one active raw batch and one prefetched raw batch.
  const memoQueue: ScanTransaction[] = [];
  const waiters = new Set<() => void>();
  const notify = () => { for (const wake of waiters) wake(); waiters.clear(); };
  const changed = () => new Promise<void>(resolve => waiters.add(resolve));
  signal.addEventListener('abort', notify);
  let compactDone = false;
  let memoError: unknown;
  const nextMemos = () => (async () => {
    while (!memoQueue.length && !compactDone) { signal.throwIfAborted(); await changed(); }
    signal.throwIfAborted();
    if (!memoQueue.length) return null;
    const batch = memoQueue.splice(0, 100);
    notify();
    const raw = await post('/api/tx/raw/batch', { txids: batch.map(tx => tx.txid) });
    return { batch, raw };
  })().then(value => ({ value, error: null })).catch((error: unknown) => ({ value: null, error }));
  const consumeMemos = async () => {
    let pendingMemos = nextMemos();
    while (true) {
      if (compactDone) options.onPhase?.('memos');
      const item = await pendingMemos;
      signal.throwIfAborted();
      if (item.error) throw item.error;
      if (!item.value) break;
      const downloaded = item.value;
      const { batch } = downloaded;
      pendingMemos = nextMemos();
      const byId = new Map<string, string>();
      for (const tx of downloaded.raw.transactions || []) if (typeof tx.hex === 'string' && tx.hex) byId.set(tx.txid, tx.hex);
      if (batch.some(tx => !byId.has(tx.txid))) throw new Error('Some matching transactions are unavailable; retry the scan');
      const metadata = new Map(batch.map(tx => [tx.txid, tx]));
      const published = new Set<string>();
      const publish = (tx: DecryptedTransaction) => {
        signal.throwIfAborted();
        const source = metadata.get(tx.txid);
        if (!source) throw new Error('Unexpected decrypted transaction');
        if (published.has(tx.txid)) return;
        published.add(tx.txid);
        if (!tx.outputs.length) return;
        for (const output of tx.outputs) messages.push({ ...source, ...output, txid: compactTxIdToDisplay(source.txid) });
        dirty = true;
        // Show the first memo immediately, then coalesce UI work during bursts.
        if (Date.now() - lastPublish >= 50) flushMessages();
      };
      if (compactDone) options.onPhase?.('decrypting');
      const decrypted = await scanner.decryptMemos(batch.map(tx => ({ txid: tx.txid, hex: byId.get(tx.txid)! })), publish);
      signal.throwIfAborted();
      // Support scanners without streaming callbacks and never publish an output twice.
      for (const tx of decrypted) publish(tx);
      if (published.size !== batch.length) throw new Error('Incomplete memo decryption results');
      flushMessages();
    }
  };
  // Capture background failures immediately; abort both pipelines and wake
  // producers waiting for queue capacity. The foreground rethrows the cause.
  const memoTask = consumeMemos().catch(error => { memoError = error; controller.abort(); notify(); });
  try {
    while (true) {
      options.onPhase?.('fetching');
      const range = initialized ? await pending : await Promise.all([pending, options.initialize?.()]).then(([result]) => result);
      initialized = true;
      signal.throwIfAborted();
      if (!range.value) throw range.error;
      if (range.value.done) break;
      const blocks = range.value.value;
      const start = Number(blocks[0].height);
      pending = next();
      options.onPhase?.('filtering');
      const matching = await scanner.filterCompactBlocks(blocks);
      signal.throwIfAborted();
      const fresh = matching.filter(tx => { if (seen.has(tx.txid)) return false; seen.add(tx.txid); return true; });
      matches += fresh.length;
      onProgress(start - startHeight, matches);
      for (let offset = 0; offset < fresh.length;) {
        while (memoQueue.length >= 200) {
          options.onPhase?.('memos');
          signal.throwIfAborted();
          await changed();
        }
        signal.throwIfAborted();
        const count = Math.min(200 - memoQueue.length, fresh.length - offset);
        memoQueue.push(...fresh.slice(offset, offset + count));
        offset += count;
        notify();
      }
      onProgress(Number(blocks.at(-1)!.height) - startHeight + 1, matches);
    }
    compactDone = true;
    options.onPhase?.('memos');
    notify();
    await memoTask;
    if (memoError) throw memoError;
    signal.throwIfAborted();
    return { matches, messages };
  } catch (error) {
    throw memoError || error;
  } finally {
    controller.abort();
    notify();
    signal.removeEventListener('abort', notify);
    options.signal.removeEventListener('abort', abort);
    // A failing initializer must not wait for an unresponsive network read.
    void iterator.return(undefined).catch(() => {});
  }
}
