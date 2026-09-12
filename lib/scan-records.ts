/** Binary ABI v1: pool byte + nullifier, commitment, epk, ciphertext. */
export const COMPACT_RECORD_SIZE = 149;
export interface CompactAction {
  pool?: 'orchard' | 'ironwood';
  nullifier: string;
  cmx: string;
  ephemeralKey: string;
  ciphertext: string;
}
export interface ScanTransaction { txid: string; height: number; timestamp: number }
export interface CompactBlock {
  height: number | string;
  time: number;
  vtx?: { hash: string; actions?: CompactAction[] }[];
}
export interface MemoOutput {
  memo: string;
  amount: number;
  amount_zatoshis: number;
  output_index: number;
  pool: 'orchard' | 'ironwood';
}
export interface ScanMemo extends ScanTransaction, MemoOutput {}

export function packActions(actions: CompactAction[]): Uint8Array {
  const bytes = new Uint8Array(actions.length * COMPACT_RECORD_SIZE);
  actions.forEach((action, index) => {
    let offset = index * COMPACT_RECORD_SIZE;
    if (action.pool !== undefined && action.pool !== 'orchard' && action.pool !== 'ironwood') {
      throw new Error('Unsupported compact pool');
    }
    bytes[offset++] = action.pool === 'orchard' ? 1 : action.pool === 'ironwood' ? 2 : 0;
    for (const [value, size] of [[action.nullifier, 32], [action.cmx, 32], [action.ephemeralKey, 32], [action.ciphertext, 52]] as const) {
      if (typeof value !== 'string' || value.length !== size * 2 || !/^[0-9a-f]+$/i.test(value)) {
        throw new Error('Invalid compact action encoding');
      }
      for (let i = 0; i < value.length; i += 2) bytes[offset++] = parseInt(value.slice(i, i + 2), 16);
    }
  });
  return bytes;
}
