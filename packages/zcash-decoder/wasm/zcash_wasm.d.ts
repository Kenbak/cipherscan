/* tslint:disable */
/* eslint-disable */

/**
 * A scan owns two prepared incoming keys. Free the session after use.
 */
export class ScanSession {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Return every readable memo, with an index unique within the transaction.
     */
    decrypt_memos(tx_hex: string): string;
    /**
     * Fixed-width records: pool (0 unknown, 1 Orchard, 2 Ironwood),
     * nullifier[32], cmx[32], epk[32], compact ciphertext[52].
     * Returns matching record indices; no transaction identifiers cross the ABI.
     */
    filter_compact(bytes: Uint8Array): Uint32Array;
    constructor(viewing_key: string);
}

/**
 * Batch filter compact outputs (MUCH FASTER!)
 * Takes JSON array of outputs and returns JSON array of matching indices
 */
export function batch_filter_compact_outputs(outputs_json: string, viewing_key: string): string;

/**
 * Decode a unified address and return its component receivers
 */
export function decode_unified_address(ua_string: string): string;

/**
 * Decrypt a compact block output (from Lightwalletd)
 * This is MUCH faster than decrypt_memo because it doesn't need the full TX
 */
export function decrypt_compact_output(nullifier_hex: string, cmx_hex: string, ephemeral_key_hex: string, ciphertext_hex: string, viewing_key: string): string;

/**
 * Compatibility API: callers requesting one memo retain the original shape.
 */
export function decrypt_memo(tx_hex: string, viewing_key: string): string;

export function detect_key_type(viewing_key: string): string;

export function main(): void;

export function test_wasm(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_scansession_free: (a: number, b: number) => void;
    readonly batch_filter_compact_outputs: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly decode_unified_address: (a: number, b: number) => [number, number, number, number];
    readonly decrypt_compact_output: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number, number];
    readonly decrypt_memo: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly detect_key_type: (a: number, b: number) => [number, number];
    readonly scansession_decrypt_memos: (a: number, b: number, c: number) => [number, number, number, number];
    readonly scansession_filter_compact: (a: number, b: number, c: number) => [number, number, number, number];
    readonly scansession_new: (a: number, b: number) => [number, number, number];
    readonly test_wasm: () => [number, number];
    readonly main: () => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
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
