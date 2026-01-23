import { useCallback, useEffect, useRef, useState } from 'react';

interface FilterProgress {
  blocksProcessed: number;
  totalBlocks: number;
  matchesFound: number;
  workersActive: number;
}

interface WorkerState {
  worker: Worker;
  blocksProcessed: number;
  matchesFound: number;
  totalBlocks: number;
  results: { txid: string; height: number; timestamp: number }[];
  done: boolean;
}

interface UseWasmWorkerPoolResult {
  filterCompactBlocks: (
    compactBlocks: any[],
    viewingKey: string,
    onProgress?: (progress: FilterProgress) => void
  ) => Promise<{ txid: string; height: number; timestamp: number }[]>;
  cancel: () => void;
  isWorking: boolean;
  workerCount: number;
}

/**
 * Multi-threaded WASM worker pool for parallel block scanning
 * Uses all available CPU cores for maximum performance
 */
export function useWasmWorkerPool(): UseWasmWorkerPoolResult {
  // Detect available CPU cores (cap at 8 to avoid memory issues)
  const workerCount = Math.min(navigator.hardwareConcurrency || 4, 8);

  const workersRef = useRef<WorkerState[]>([]);
  const [isWorking, setIsWorking] = useState(false);
  const resolveRef = useRef<((value: any) => void) | null>(null);
  const rejectRef = useRef<((reason: any) => void) | null>(null);
  const onProgressRef = useRef<((progress: FilterProgress) => void) | null>(null);
  const totalBlocksRef = useRef<number>(0);
  const cancelledRef = useRef<boolean>(false);

  // Initialize worker pool
  useEffect(() => {
    // Create N workers
    workersRef.current = Array.from({ length: workerCount }, () => {
      const worker = new Worker(
        new URL('../workers/wasm-filter.worker.ts', import.meta.url),
        { type: 'module' }
      );
      return {
        worker,
        blocksProcessed: 0,
        matchesFound: 0,
        totalBlocks: 0,
        results: [],
        done: false,
      };
    });

    // Set up message handlers for each worker
    workersRef.current.forEach((state, index) => {
      state.worker.onmessage = (e) => {
        const message = e.data;

        if (message.type === 'progress') {
          // Update this worker's progress
          state.blocksProcessed = message.blocksProcessed;
          state.matchesFound = message.matchesFound;

          // Calculate aggregate progress
          const totalProcessed = workersRef.current.reduce((sum, w) => sum + w.blocksProcessed, 0);
          const totalMatches = workersRef.current.reduce((sum, w) => sum + w.matchesFound, 0);
          const activeWorkers = workersRef.current.filter(w => !w.done).length;

          if (onProgressRef.current) {
            onProgressRef.current({
              blocksProcessed: totalProcessed,
              totalBlocks: totalBlocksRef.current,
              matchesFound: totalMatches,
              workersActive: activeWorkers,
            });
          }
        } else if (message.type === 'result') {
          // Worker finished - store its results
          state.results = message.matchingTxs;
          state.done = true;

          // Check if all workers are done
          const allDone = workersRef.current.every(w => w.done);
          if (allDone) {
            setIsWorking(false);

            // Merge results from all workers (deduplicate by txid)
            const txMap = new Map<string, { txid: string; height: number; timestamp: number }>();
            workersRef.current.forEach(w => {
              w.results.forEach(tx => {
                if (!txMap.has(tx.txid)) {
                  txMap.set(tx.txid, tx);
                }
              });
            });

            // Sort by height (newest first)
            const mergedResults = Array.from(txMap.values()).sort((a, b) => b.height - a.height);

            if (resolveRef.current) {
              resolveRef.current(mergedResults);
              resolveRef.current = null;
              rejectRef.current = null;
              onProgressRef.current = null;
            }
          }
        } else if (message.type === 'error') {
          // Worker error - fail entire operation
          state.done = true;
          setIsWorking(false);

          if (rejectRef.current) {
            rejectRef.current(new Error(`Worker ${index}: ${message.error}`));
            resolveRef.current = null;
            rejectRef.current = null;
            onProgressRef.current = null;
          }
        }
      };

      state.worker.onerror = (error) => {
        state.done = true;
        setIsWorking(false);

        if (rejectRef.current) {
          rejectRef.current(error);
          resolveRef.current = null;
          rejectRef.current = null;
          onProgressRef.current = null;
        }
      };
    });

    // Cleanup
    return () => {
      workersRef.current.forEach(state => {
        state.worker.terminate();
      });
      workersRef.current = [];
    };
  }, [workerCount]);

  const filterCompactBlocks = useCallback(
    (
      compactBlocks: any[],
      viewingKey: string,
      onProgress?: (progress: FilterProgress) => void
    ): Promise<{ txid: string; height: number; timestamp: number }[]> => {
      if (workersRef.current.length === 0) {
        return Promise.reject(new Error('Worker pool not initialized'));
      }

      setIsWorking(true);
      cancelledRef.current = false;
      onProgressRef.current = onProgress || null;
      totalBlocksRef.current = compactBlocks.length;

      // Reset worker states
      workersRef.current.forEach(state => {
        state.blocksProcessed = 0;
        state.matchesFound = 0;
        state.totalBlocks = 0;
        state.results = [];
        state.done = false;
      });

      // Split blocks across workers
      const numWorkers = workersRef.current.length;
      const blocksPerWorker = Math.ceil(compactBlocks.length / numWorkers);

      console.log(`🚀 [WORKER POOL] Spawning ${numWorkers} workers for ${compactBlocks.length} blocks (${blocksPerWorker} each)`);

      return new Promise((resolve, reject) => {
        resolveRef.current = resolve;
        rejectRef.current = reject;

        // Distribute blocks to workers
        workersRef.current.forEach((state, index) => {
          const start = index * blocksPerWorker;
          const end = Math.min(start + blocksPerWorker, compactBlocks.length);
          const chunk = compactBlocks.slice(start, end);

          state.totalBlocks = chunk.length;

          if (chunk.length > 0) {
            console.log(`🔧 [WORKER ${index}] Assigned blocks ${start} to ${end} (${chunk.length} blocks)`);
            state.worker.postMessage({
              type: 'filter',
              compactBlocks: chunk,
              viewingKey,
            });
          } else {
            // No blocks for this worker, mark as done immediately
            state.done = true;
          }
        });

        // Check if all workers were empty (edge case)
        if (workersRef.current.every(w => w.done)) {
          setIsWorking(false);
          resolve([]);
        }
      });
    },
    []
  );

  const cancel = useCallback(() => {
    if (workersRef.current.length > 0 && isWorking) {
      cancelledRef.current = true;
      workersRef.current.forEach(state => {
        state.worker.postMessage({ type: 'cancel' });
      });
    }
  }, [isWorking]);

  return {
    filterCompactBlocks,
    cancel,
    isWorking,
    workerCount,
  };
}
