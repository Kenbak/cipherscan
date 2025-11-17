// WASM Loader for Zcash memo decryption
// This wrapper handles dynamic loading of the WASM module

let wasmModule: any = null;
let wasmInitialized = false;

export interface ZcashWasm {
  test_wasm: () => string;
  detect_key_type: (viewingKey: string) => string;
  decrypt_memo: (txHex: string, viewingKey: string) => string;
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
 */
export async function decryptMemo(txHex: string, viewingKey: string): Promise<string> {
  const wasm = await loadWasm();
  return wasm.decrypt_memo(txHex, viewingKey);
}

/**
 * Decrypt a memo from a transaction ID (fetches raw hex first)
 */
export async function decryptMemoFromTxid(txid: string, viewingKey: string): Promise<string> {
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
