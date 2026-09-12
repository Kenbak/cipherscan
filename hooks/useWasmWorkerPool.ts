import { useCallback, useEffect, useRef, useState } from 'react';
import { packActions, type CompactAction, type CompactBlock, type MemoOutput, type ScanTransaction } from '@/lib/scan-records';

interface WorkerClient {
  worker: Worker;
  pending: Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>;
}
interface FilterProgress { blocksProcessed: number; totalBlocks: number; matchesFound: number; workersActive: number }
const abortError = () => new DOMException('Scan cancelled', 'AbortError');

/** Each scan owns workers and prepared keys; termination also cancels synchronous WASM. */
export function useWasmWorkerPool() {
  const clients = useRef<WorkerClient[]>([]);
  const nextId = useRef(0);
  const [isWorking, setIsWorking] = useState(false);
  const [workerCount, setWorkerCount] = useState(0);

  const dispose = useCallback(() => {
    for (const client of clients.current) {
      client.worker.terminate();
      for (const pending of client.pending.values()) pending.reject(abortError());
      client.pending.clear();
    }
    clients.current = [];
  }, []);
  useEffect(() => dispose, [dispose]);

  const request = useCallback((client: WorkerClient, data: object, transfer: Transferable[] = []) => {
    return new Promise<any>((resolve, reject) => {
      const id = ++nextId.current;
      client.pending.set(id, { resolve, reject });
      try { client.worker.postMessage({ type: 'session', id, ...data }, transfer); }
      catch (error) { client.pending.delete(id); reject(error); }
    });
  }, []);

  const cancel = useCallback(() => { dispose(); setIsWorking(false); }, [dispose]);
  const begin = useCallback(async (viewingKey: string) => {
    dispose();
    const count = Math.max(1, Math.min((navigator.hardwareConcurrency || 4) - 1, 8));
    setWorkerCount(count);
    setIsWorking(true);
    try {
      clients.current = Array.from({ length: count }, () => {
        const client: WorkerClient = {
          worker: new Worker(new URL('../workers/wasm-filter.worker.ts', import.meta.url), { type: 'module' }),
          pending: new Map(),
        };
        client.worker.onmessage = ({ data }) => {
          const pending = client.pending.get(data.id);
          if (!pending) return;
          client.pending.delete(data.id);
          if (data.type === 'session-error') pending.reject(new Error(data.error));
          else pending.resolve(data.result);
        };
        client.worker.onerror = () => {
          for (const pending of client.pending.values()) pending.reject(new Error('Scan worker failed'));
          client.pending.clear();
        };
        return client;
      });
      await Promise.all(clients.current.map(client => request(client, { operation: 'init', viewingKey })));
    } catch (error) { cancel(); throw error; }
  }, [cancel, dispose, request]);

  const filterCompactBlocks = useCallback(async (blocks: CompactBlock[], onProgress?: (progress: FilterProgress) => void): Promise<ScanTransaction[]> => {
    const active = clients.current;
    if (!active.length) throw abortError();
    // Bound crypto batches by action count, rather than unpredictable block density.
    const jobs: { actions: CompactAction[]; transactions: ScanTransaction[] }[] = [];
    let job = { actions: [] as CompactAction[], transactions: [] as ScanTransaction[] };
    for (const block of blocks) for (const tx of block.vtx || []) for (const action of tx.actions || []) {
      job.actions.push(action);
      job.transactions.push({ txid: tx.hash, height: Number(block.height), timestamp: block.time });
      if (job.actions.length === 512) { jobs.push(job); job = { actions: [], transactions: [] }; }
    }
    if (job.actions.length) jobs.push(job);
    let cursor = 0;
    let completed = 0;
    const matches = new Map<string, ScanTransaction>();
    await Promise.all(active.map(async client => {
      while (cursor < jobs.length) {
        if (clients.current !== active) throw abortError();
        const current = jobs[cursor++];
        const bytes = packActions(current.actions);
        const indices: number[] = await request(client, { operation: 'filter', bytes }, [bytes.buffer]);
        for (const index of indices) {
          const tx = current.transactions[index];
          if (!tx) throw new Error('Invalid scan result');
          matches.set(tx.txid, tx);
        }
        completed++;
        onProgress?.({ blocksProcessed: Math.floor(blocks.length * completed / jobs.length), totalBlocks: blocks.length, matchesFound: matches.size, workersActive: active.length });
      }
    }));
    return [...matches.values()].sort((a, b) => b.height - a.height);
  }, [request]);

  const decryptMemos = useCallback(async (transactions: { txid: string; hex: string }[]): Promise<{ txid: string; outputs: MemoOutput[] }[]> => {
    const active = clients.current;
    if (!active.length) throw abortError();
    let cursor = 0;
    const results: { txid: string; outputs: MemoOutput[] }[] = [];
    await Promise.all(active.map(async client => {
      while (cursor < transactions.length) {
        if (clients.current !== active) throw abortError();
        const tx = transactions[cursor++];
        results.push(...await request(client, { operation: 'memos', transactions: [tx] }));
      }
    }));
    return results;
  }, [request]);

  return { begin, filterCompactBlocks, decryptMemos, cancel, isWorking, workerCount };
}
