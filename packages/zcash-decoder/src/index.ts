/**
 * @cipherscan/zcash-decoder
 *
 * Client-side decoder for Zcash shielded transactions and memos.
 *
 * Features:
 * - 100% client-side memo decryption (viewing key never leaves browser)
 * - Batch compact block filtering (13x faster than sequential)
 * - Web Worker compatible (zero UI freeze)
 * - TypeScript support
 *
 * @example
 * ```typescript
 * import { ZcashWASM } from '@cipherscan/zcash-decoder';
 *
 * // Initialize WASM module
 * const wasm = await ZcashWASM.init();
 *
 * // Decrypt a transaction memo
 * const result = await wasm.decryptMemo(txHex, viewingKey);
 * console.log(result.memo, result.amount);
 *
 * // Filter compact blocks
 * const matches = await wasm.filterCompactBlocks(blocks, viewingKey);
 * ```
 */

export * from './types.js';

import type {
  DecryptedOutput,
  CompactBlock,
  MatchingTransaction,
  FilterProgress,
  ViewingKeyType,
} from './types.js';

/**
 * WASM module interface (loaded from zcash_wasm.js)
 */
interface WASMModule {
  decrypt_memo: (txHex: string, viewingKey: string) => string;
  batch_filter_compact_outputs: (outputsJson: string, viewingKey: string) => string;
  detect_key_type: (viewingKey: string) => string;
}

/**
 * Main ZcashWASM class for client-side Zcash operations
 */
export class ZcashWASM {
  private wasmModule: WASMModule | null = null;

  private constructor() {}

  /**
   * Initialize the WASM module
   * @returns Promise<ZcashWASM> Initialized WASM instance
   *
   * @example
   * ```typescript
   * const wasm = await ZcashWASM.init();
   * ```
   */
  static async init(): Promise<ZcashWASM> {
    const instance = new ZcashWASM();
    await instance.loadWASM();
    return instance;
  }

  /**
   * Load the WASM module from the wasm/ directory
   */
  private async loadWASM(): Promise<void> {
    if (this.wasmModule) return;

    try {
      // Dynamically import the WASM module
      // @ts-ignore - Dynamic import
      const wasmInit = await import('../wasm/zcash_wasm.js');

      // Initialize WASM
      await wasmInit.default();

      this.wasmModule = {
        decrypt_memo: wasmInit.decrypt_memo,
        batch_filter_compact_outputs: wasmInit.batch_filter_compact_outputs,
        detect_key_type: wasmInit.detect_key_type,
      };
    } catch (error) {
      throw new Error(`Failed to load WASM module: ${error}`);
    }
  }

  /**
   * Decrypt a shielded transaction memo
   *
   * @param txHex - Raw transaction hex
   * @param viewingKey - Unified Full Viewing Key (UFVK)
   * @returns Promise<DecryptedOutput> Decrypted memo and amount
   *
   * @example
   * ```typescript
   * const result = await wasm.decryptMemo(
   *   '0400008085202f89...',
   *   'uviewtest1...'
   * );
   * console.log('Memo:', result.memo);
   * console.log('Amount:', result.amount, 'ZEC');
   * ```
   */
  async decryptMemo(txHex: string, viewingKey: string): Promise<DecryptedOutput> {
    if (!this.wasmModule) {
      throw new Error('WASM module not initialized. Call ZcashWASM.init() first.');
    }

    try {
      const resultJson = this.wasmModule.decrypt_memo(txHex, viewingKey);
      return JSON.parse(resultJson);
    } catch (error) {
      throw new Error(`Failed to decrypt memo: ${error}`);
    }
  }

  /**
   * Filter compact blocks to find transactions matching the viewing key
   *
   * This is much faster than full decryption as it only checks compact block data.
   * Use this for "birthday scans" to find all transactions for a viewing key.
   *
   * @param compactBlocks - Array of compact blocks from Lightwalletd
   * @param viewingKey - Unified Full Viewing Key (UFVK)
   * @param onProgress - Optional progress callback
   * @returns Promise<MatchingTransaction[]> Transactions matching the viewing key
   *
   * @example
   * ```typescript
   * const matches = await wasm.filterCompactBlocks(
   *   compactBlocks,
   *   'uviewtest1...',
   *   (progress) => {
   *     console.log(`${progress.blocksProcessed}/${progress.totalBlocks}`);
   *   }
   * );
   * console.log(`Found ${matches.length} transactions`);
   * ```
   */
  async filterCompactBlocks(
    compactBlocks: CompactBlock[],
    viewingKey: string,
    onProgress?: (progress: FilterProgress) => void
  ): Promise<MatchingTransaction[]> {
    if (!this.wasmModule) {
      throw new Error('WASM module not initialized. Call ZcashWASM.init() first.');
    }

    const totalBlocks = compactBlocks.length;
    const matchingTxs: MatchingTransaction[] = [];
    const txMap = new Map<string, MatchingTransaction>();

    // Process in chunks for progress updates
    const CHUNK_SIZE = 10000;

    for (let chunkStart = 0; chunkStart < totalBlocks; chunkStart += CHUNK_SIZE) {
      const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, totalBlocks);
      const chunk = compactBlocks.slice(chunkStart, chunkEnd);

      // Extract all Orchard and Sapling outputs
      const allOutputs: any[] = [];

      for (const block of chunk) {
        for (const tx of block.vtx || []) {
          // Orchard actions
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

          // Sapling outputs
          for (const output of tx.outputs || []) {
            allOutputs.push({
              nullifier: '0000000000000000000000000000000000000000000000000000000000000000',
              cmx: output.cmu,
              ephemeral_key: output.ephemeralKey,
              ciphertext: output.ciphertext,
              txid: tx.hash,
              height: parseInt(block.height),
              timestamp: block.time,
            });
          }
        }
      }

      if (allOutputs.length > 0) {
        // Call WASM batch filter
        const outputsJson = JSON.stringify(allOutputs);
        const matchesJson = this.wasmModule.batch_filter_compact_outputs(outputsJson, viewingKey);
        const matches = JSON.parse(matchesJson);

        // Map indices back to transactions
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
      }

      // Report progress
      if (onProgress) {
        onProgress({
          blocksProcessed: chunkEnd,
          totalBlocks,
          matchesFound: matchingTxs.length,
        });
      }
    }

    return matchingTxs;
  }

  /**
   * Detect the type of viewing key
   *
   * @param viewingKey - Viewing key to detect
   * @returns ViewingKeyType Type of the viewing key
   *
   * @example
   * ```typescript
   * const type = wasm.detectKeyType('uviewtest1...');
   * console.log(type); // 'ufvk-testnet'
   * ```
   */
  detectKeyType(viewingKey: string): ViewingKeyType {
    if (!this.wasmModule) {
      throw new Error('WASM module not initialized. Call ZcashWASM.init() first.');
    }

    return this.wasmModule.detect_key_type(viewingKey) as ViewingKeyType;
  }
}

/**
 * Default export for convenience
 */
export default ZcashWASM;
