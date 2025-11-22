/* tslint:disable */
/* eslint-disable */
/**
 * Decrypt a compact block output (from Lightwalletd)
 * This is MUCH faster than decrypt_memo because it doesn't need the full TX
 */
export function decrypt_compact_output(nullifier_hex: string, cmx_hex: string, ephemeral_key_hex: string, ciphertext_hex: string, viewing_key: string): string;
export function detect_key_type(viewing_key: string): string;
/**
 * Batch filter compact outputs (MUCH FASTER!)
 * Takes JSON array of outputs and returns JSON array of matching indices
 */
export function batch_filter_compact_outputs(outputs_json: string, viewing_key: string): string;
/**
 * Orchard memo decryption - The Official Way™
 */
export function decrypt_memo(tx_hex: string, viewing_key: string): string;
export function test_wasm(): string;
export function main(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly batch_filter_compact_outputs: (a: number, b: number, c: number, d: number) => [number, number, number, number];
  readonly decrypt_compact_output: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number, number];
  readonly decrypt_memo: (a: number, b: number, c: number, d: number) => [number, number, number, number];
  readonly detect_key_type: (a: number, b: number) => [number, number];
  readonly test_wasm: () => [number, number];
  readonly main: () => void;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
