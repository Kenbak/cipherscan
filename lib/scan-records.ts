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
  vtx?: { hash: string; actions?: CompactAction[]; records?: string }[];
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

/** Decode only the binary representation selected by the versioned response. */
export function compactJobs(blocks: CompactBlock[]) {
  const jobs: { bytes: Uint8Array; transactions: ScanTransaction[] }[] = [];
  let bytes = new Uint8Array(512 * COMPACT_RECORD_SIZE);
  let transactions: ScanTransaction[] = [];
  const flush = () => {
    if (transactions.length) jobs.push({ bytes: bytes.slice(0, transactions.length * COMPACT_RECORD_SIZE), transactions });
    bytes = new Uint8Array(512 * COMPACT_RECORD_SIZE); transactions = [];
  };
  for (const block of blocks) for (const tx of block.vtx || []) {
    let packed: Uint8Array;
    if (tx.records !== undefined) {
      if (tx.actions !== undefined || typeof tx.records !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(tx.records)) throw new Error('Invalid compact records');
      const decoded = atob(tx.records);
      packed = new Uint8Array(decoded.length);
      for (let i = 0; i < decoded.length; i++) packed[i] = decoded.charCodeAt(i);
      if (packed.length % COMPACT_RECORD_SIZE) throw new Error('Invalid compact record length');
    } else packed = packActions(tx.actions || []);
    const metadata = { txid: tx.hash, height: Number(block.height), timestamp: block.time };
    for (let offset = 0; offset < packed.length; offset += COMPACT_RECORD_SIZE) {
      if (packed[offset] > 2) throw new Error('Unsupported compact pool');
      bytes.set(packed.subarray(offset, offset + COMPACT_RECORD_SIZE), transactions.length * COMPACT_RECORD_SIZE);
      transactions.push(metadata);
      if (transactions.length === 512) flush();
    }
  }
  flush();
  return jobs;
}
