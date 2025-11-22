// Web Worker for WASM batch filtering (runs off main thread for 0% UI freeze)
// This keeps the UI responsive during large birthday scans (500k+ blocks)

/// <reference lib="webworker" />

// Import types for messages
export interface FilterRequest {
  type: 'filter';
  compactBlocks: any[];
  viewingKey: string;
}

export interface ProgressMessage {
  type: 'progress';
  blocksProcessed: number;
  totalBlocks: number;
  matchesFound: number;
}

export interface ResultMessage {
  type: 'result';
  matchingTxs: { txid: string; height: number; timestamp: number }[];
}

export interface ErrorMessage {
  type: 'error';
  error: string;
}

export interface CancelMessage {
  type: 'cancel';
}

export type WorkerMessage = FilterRequest | CancelMessage;
export type WorkerResponse = ProgressMessage | ResultMessage | ErrorMessage;

// Worker state
let wasmModule: any = null;
let shouldCancel = false;

// Load WASM module (only once)
async function loadWasm() {
  if (wasmModule) return wasmModule;

  try {
    console.log('[Worker] Loading WASM module...');

    // Get the full URL to the WASM module in /public/wasm
    const origin = self.location.origin;
    const wasmJsUrl = `${origin}/wasm/zcash_wasm.js`;

    console.log('[Worker] WASM URL:', wasmJsUrl);

    // Use dynamic import with full URL to bypass Next.js bundling
    const wasmInit = await import(/* @vite-ignore */ /* webpackIgnore: true */ wasmJsUrl);

    console.log('[Worker] WASM module imported, initializing...');

    // Initialize the WASM module (it will load the .wasm file automatically)
    await wasmInit.default();

    console.log('[Worker] WASM initialized successfully');

    wasmModule = {
      batch_filter_compact_outputs: wasmInit.batch_filter_compact_outputs,
    };

    return wasmModule;
  } catch (error) {
    console.error('[Worker] Failed to load WASM:', error);
    throw new Error(`Failed to load WASM: ${error}`);
  }
}

// Main filtering logic (runs in Worker thread)
async function filterCompactBlocks(
  compactBlocks: any[],
  viewingKey: string
): Promise<{ txid: string; height: number; timestamp: number }[]> {
  const wasm = await loadWasm();
  const totalBlocks = compactBlocks.length;
  const matchingTxs: { txid: string; height: number; timestamp: number }[] = [];
  const txMap = new Map<string, { txid: string; height: number; timestamp: number }>();

  // Process in chunks (10k blocks = ~1-2 seconds each)
  const CHUNK_SIZE = 10000;

  for (let chunkStart = 0; chunkStart < totalBlocks; chunkStart += CHUNK_SIZE) {
    // Check for cancellation
    if (shouldCancel) {
      console.log('🛑 [Worker] Cancelled by user, returning partial results');
      // Return partial results instead of throwing
      return matchingTxs;
    }

    const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, totalBlocks);
    const chunk = compactBlocks.slice(chunkStart, chunkEnd);

    // Extract all Orchard outputs from this chunk
    const allOutputs: any[] = [];

    for (const block of chunk) {
      for (const tx of block.vtx || []) {
        for (const action of tx.actions || []) {
          allOutputs.push({
            nullifier: action.nullifier,
            cmx: action.cmx,
            ephemeral_key: action.ephemeralKey,
            ciphertext: action.ciphertext,
            txid: tx.hash,
            height: parseInt(block.height),
            timestamp: block.time,
          });
        }
      }
    }

    if (allOutputs.length === 0) {
      // Send progress update
      self.postMessage({
        type: 'progress',
        blocksProcessed: chunkEnd,
        totalBlocks,
        matchesFound: matchingTxs.length,
      } as ProgressMessage);
      continue;
    }

    // Call WASM batch API for this chunk
    const outputsJson = JSON.stringify(allOutputs);
    const matchesJson = wasm.batch_filter_compact_outputs(outputsJson, viewingKey);
    const matches = JSON.parse(matchesJson);

    // Convert matches to TXIDs (deduplicate)
    for (const match of matches) {
      const output = allOutputs[match.index];
      if (!txMap.has(output.txid)) {
        const tx = {
          txid: output.txid,
          height: output.height,
          timestamp: output.timestamp,
        };
        txMap.set(output.txid, tx);
        matchingTxs.push(tx);
      }
    }

    // Send progress update
    self.postMessage({
      type: 'progress',
      blocksProcessed: chunkEnd,
      totalBlocks,
      matchesFound: matchingTxs.length,
    } as ProgressMessage);

    // Small delay to allow main thread to process messages
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  return matchingTxs;
}

// Handle messages from main thread
self.addEventListener('message', async (e: MessageEvent<WorkerMessage>) => {
  const message = e.data;

  // Validate message structure
  if (!message || typeof message !== 'object') {
    self.postMessage({
      type: 'error',
      error: 'Invalid message format',
    } as ErrorMessage);
    return;
  }

  if (message.type === 'cancel') {
    shouldCancel = true;
    return;
  }

  if (message.type === 'filter') {
    // Validate input data
    if (!Array.isArray(message.compactBlocks)) {
      self.postMessage({
        type: 'error',
        error: 'Invalid compactBlocks: must be an array',
      } as ErrorMessage);
      return;
    }

    if (!message.viewingKey || typeof message.viewingKey !== 'string') {
      self.postMessage({
        type: 'error',
        error: 'Invalid viewingKey: must be a non-empty string',
      } as ErrorMessage);
      return;
    }

    // Validate viewing key format (UFVK)
    if (!message.viewingKey.startsWith('uviewtest') && !message.viewingKey.startsWith('uview')) {
      self.postMessage({
        type: 'error',
        error: 'Invalid viewingKey: must start with uviewtest or uview',
      } as ErrorMessage);
      return;
    }

    shouldCancel = false; // Reset cancel flag

    try {
      const matchingTxs = await filterCompactBlocks(
        message.compactBlocks,
        message.viewingKey
      );

      // Send final result
      self.postMessage({
        type: 'result',
        matchingTxs,
      } as ResultMessage);
    } catch (error: any) {
      // Send error
      self.postMessage({
        type: 'error',
        error: error.message || 'Unknown error',
      } as ErrorMessage);
    }
  } else {
    // Unknown message type
    self.postMessage({
      type: 'error',
      error: `Unknown message type: ${(message as any).type}`,
    } as ErrorMessage);
  }
});

// Export empty object for TypeScript
export {};
