// WASM Loader for Zcash memo decryption
// This wrapper handles dynamic loading of the WASM module

let wasmModule: any = null;
let wasmInitialized = false;

export interface DecryptedOutput {
  memo: string;
  amount: number; // Amount in ZEC
}

export interface ZcashWasm {
  test_wasm: () => string;
  detect_key_type: (viewingKey: string) => string;
  decrypt_memo: (txHex: string, viewingKey: string) => string;
  decrypt_compact_output: (nullifierHex: string, cmuHex: string, ephemeralKeyHex: string, ciphertextHex: string, viewingKey: string) => string;
}

/**
 * Load and initialize the WASM module
 * @returns Promise<ZcashWasm> - The initialized WASM module
 */
export async function loadWasm(): Promise<ZcashWasm> {
  if (wasmModule && wasmInitialized) {
    return wasmModule;
  }

  try {
    // Use dynamic import to load the wasm-bindgen generated JS
    // We need to use a function to avoid webpack trying to resolve it at build time
    const loadWasmModule = new Function('return import("/wasm/zcash_wasm.js")');
    const wasmInit = await loadWasmModule();

    // Initialize the WASM (this loads the .wasm file from public/)
    await wasmInit.default();

    // Extract the exported functions
      wasmModule = {
        test_wasm: wasmInit.test_wasm,
        detect_key_type: wasmInit.detect_key_type,
        decrypt_memo: wasmInit.decrypt_memo,
        decrypt_compact_output: wasmInit.decrypt_compact_output,
      };

    wasmInitialized = true;
    return wasmModule;
  } catch (error) {
    console.error('❌ Failed to load WASM:', error);
    console.error('Error details:', error);
    throw error;
  }
}

/**
 * Test if WASM is working
 */
export async function testWasm(): Promise<string> {
  const wasm = await loadWasm();
  return wasm.test_wasm();
}

/**
 * Detect the type of viewing key
 */
export async function detectKeyType(viewingKey: string): Promise<string> {
  const wasm = await loadWasm();
  return wasm.detect_key_type(viewingKey);
}

/**
 * Decrypt a memo from a transaction
 * @returns DecryptedOutput with memo and amount
 */
export async function decryptMemo(txHex: string, viewingKey: string): Promise<DecryptedOutput> {
  const wasm = await loadWasm();
  const result = wasm.decrypt_memo(txHex, viewingKey);

  // Parse JSON response from WASM
  return JSON.parse(result);
}

/**
 * Decrypt a memo from a transaction ID (fetches raw hex first)
 * @returns DecryptedOutput with memo and amount
 */
export async function decryptMemoFromTxid(txid: string, viewingKey: string): Promise<DecryptedOutput> {
  // Use the correct API based on network
  const apiBaseUrl = process.env.NEXT_PUBLIC_POSTGRES_API_URL || 'https://api.testnet.cipherscan.app';
  const apiUrl = `${apiBaseUrl}/api/tx/${txid}/raw`;

  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch transaction: ${response.status}`);
    }

    const txData = await response.json();

    // Check if we have raw hex
    if (txData.hex) {
      return decryptMemo(txData.hex, viewingKey);
    }

    throw new Error('Transaction data does not include raw hex');
  } catch (error) {
    throw new Error(`Could not fetch transaction. Please provide the raw transaction hex instead.`);
  }
}

/**
 * Filter compact block outputs to find which ones belong to the viewing key
 * Returns the TXIDs that match (without decrypting the full memo)
 */
export async function filterCompactOutputs(
  compactBlocks: any[],
  viewingKey: string,
  onProgress?: (blocksProcessed: number, totalBlocks: number, matchesFound: number) => void
): Promise<{ txid: string; height: number; timestamp: number }[]> {
  console.log(`🔍 [FILTER] Starting to filter ${compactBlocks.length} compact blocks...`);

  const wasm = await loadWasm();
  const matchingTxs: { txid: string; height: number; timestamp: number }[] = [];

  let totalOutputs = 0;
  let blocksProcessed = 0;
  const progressInterval = Math.max(1, Math.floor(compactBlocks.length / 100)); // Update every 1%

  for (const block of compactBlocks) {
    blocksProcessed++;

    // Update progress callback every 1% (or every 5000 blocks, whichever is less frequent)
    if (onProgress && (blocksProcessed % Math.min(progressInterval, 5000) === 0 || blocksProcessed === compactBlocks.length)) {
      onProgress(blocksProcessed, compactBlocks.length, matchingTxs.length);
    }

    for (const tx of block.vtx || []) {
      let txMatched = false;

      // Check Orchard actions (most common for new TXs)
      for (const action of tx.actions || []) {
        totalOutputs++;

        try {
          // Try to decrypt this Orchard action
          const result = wasm.decrypt_compact_output(
            action.nullifier,
            action.cmx,
            action.ephemeralKey,
            action.ciphertext,
            viewingKey
          );

          // If decryption succeeds, this TX belongs to us!
          console.log(`✅ [FILTER] Found matching TX (Orchard): ${tx.hash.slice(0, 8)}... at block ${block.height}`);
          matchingTxs.push({
            txid: tx.hash,
            height: parseInt(block.height),
            timestamp: block.time,
          });

          txMatched = true;
          break;
        } catch (error) {
          // Not our action, continue silently
        }
      }

      // If already matched, skip Sapling outputs
      if (txMatched) continue;

      // Check Sapling outputs (for older TXs)
      for (const output of tx.outputs || []) {
        totalOutputs++;

        try {
          // Try to decrypt this Sapling output
          // Note: Sapling doesn't have nullifiers in compact blocks, use dummy
          const result = wasm.decrypt_compact_output(
            '0000000000000000000000000000000000000000000000000000000000000000',
            output.cmu,
            output.ephemeralKey,
            output.ciphertext,
            viewingKey
          );

          // If decryption succeeds, this TX belongs to us!
          console.log(`✅ [FILTER] Found matching TX (Sapling): ${tx.hash.slice(0, 8)}... at block ${block.height}`);
          matchingTxs.push({
            txid: tx.hash,
            height: parseInt(block.height),
            timestamp: block.time,
          });

          break;
        } catch (error) {
          // Not our output, continue silently
        }
      }
    }
  }

  console.log(`✅ [FILTER] Filtering complete! Checked ${totalOutputs} outputs across ${compactBlocks.length} blocks, found ${matchingTxs.length} matches`);
  return matchingTxs;
}
