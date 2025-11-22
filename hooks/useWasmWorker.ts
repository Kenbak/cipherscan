import { useCallback, useEffect, useRef, useState } from 'react';

interface FilterProgress {
  blocksProcessed: number;
  totalBlocks: number;
  matchesFound: number;
}

interface UseWasmWorkerResult {
  filterCompactBlocks: (
    compactBlocks: any[],
    viewingKey: string,
    onProgress?: (progress: FilterProgress) => void
  ) => Promise<{ txid: string; height: number; timestamp: number }[]>;
  cancel: () => void;
  isWorking: boolean;
}

export function useWasmWorker(): UseWasmWorkerResult {
  const workerRef = useRef<Worker | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const resolveRef = useRef<((value: any) => void) | null>(null);
  const rejectRef = useRef<((reason: any) => void) | null>(null);
  const onProgressRef = useRef<((progress: FilterProgress) => void) | null>(null);

  // Initialize worker
  useEffect(() => {
    // Create worker with type: 'module' to support ES6 imports
    workerRef.current = new Worker(
      new URL('../workers/wasm-filter.worker.ts', import.meta.url),
      { type: 'module' }
    );

    // Handle messages from worker
    workerRef.current.onmessage = (e) => {
      const message = e.data;

      if (message.type === 'progress') {
        if (onProgressRef.current) {
          onProgressRef.current({
            blocksProcessed: message.blocksProcessed,
            totalBlocks: message.totalBlocks,
            matchesFound: message.matchesFound,
          });
        }
      } else if (message.type === 'result') {
        setIsWorking(false);
        if (resolveRef.current) {
          resolveRef.current(message.matchingTxs);
          resolveRef.current = null;
          rejectRef.current = null;
          onProgressRef.current = null;
        }
      } else if (message.type === 'error') {
        setIsWorking(false);
        if (rejectRef.current) {
          rejectRef.current(new Error(message.error));
          resolveRef.current = null;
          rejectRef.current = null;
          onProgressRef.current = null;
        }
      }
    };

    // Handle worker errors
    workerRef.current.onerror = (error) => {
      setIsWorking(false);
      if (rejectRef.current) {
        rejectRef.current(error);
        resolveRef.current = null;
        rejectRef.current = null;
        onProgressRef.current = null;
      }
    };

    // Cleanup
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  const filterCompactBlocks = useCallback(
    (
      compactBlocks: any[],
      viewingKey: string,
      onProgress?: (progress: FilterProgress) => void
    ): Promise<{ txid: string; height: number; timestamp: number }[]> => {
      if (!workerRef.current) {
        return Promise.reject(new Error('Worker not initialized'));
      }

      setIsWorking(true);
      onProgressRef.current = onProgress || null;

      return new Promise((resolve, reject) => {
        resolveRef.current = resolve;
        rejectRef.current = reject;

        // Send filter request to worker
        workerRef.current!.postMessage({
          type: 'filter',
          compactBlocks,
          viewingKey,
        });
      });
    },
    []
  );

  const cancel = useCallback(() => {
    if (workerRef.current && isWorking) {
      workerRef.current.postMessage({ type: 'cancel' });
    }
  }, [isWorking]);

  return {
    filterCompactBlocks,
    cancel,
    isWorking,
  };
}
