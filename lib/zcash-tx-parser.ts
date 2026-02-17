/**
 * Client-side Zcash Transaction Parser
 *
 * Parses raw transaction hex into structured data per ZIP-225 (v5 transactions)
 * and legacy formats (v1-v4). No node dependency — works entirely in the browser.
 *
 * References:
 * - ZIP-225: https://zips.z.cash/zip-0225
 * - ZIP-243: https://zips.z.cash/zip-0243 (v4 sighash)
 * - Zcash protocol spec §7.1
 */

// Known version group IDs
const VERSION_GROUP_IDS: Record<number, string> = {
  0x03c48270: 'Overwinter',
  0x892f2085: 'Sapling',
  0x26a7270a: 'NU5',
};

// Known consensus branch IDs
const CONSENSUS_BRANCH_IDS: Record<number, string> = {
  0x00000000: 'Sprout',
  0x00000001: 'Overwinter',
  0x76b809bb: 'Sapling',
  0x2bb40e60: 'Blossom',
  0xf5b9230b: 'Heartwood',
  0xe9ff75a6: 'Canopy',
  0xc2d6d0b4: 'NU5',
  0xc8e71055: 'NU6',
  0x4dec4df0: 'NU6.1',
};

export interface ParsedVin {
  txid: string;
  vout: number;
  scriptSig: { hex: string };
  sequence: number;
  coinbase?: string;
}

export interface ParsedScriptPubKey {
  hex: string;
  type: string;
  address?: string;
}

export interface ParsedVout {
  value: number;
  n: number;
  scriptPubKey: ParsedScriptPubKey;
}

export interface ParsedTransaction {
  txid?: string;
  version: number;
  fOverwintered: boolean;
  versionGroupId?: string;
  versionGroupName?: string;
  consensusBranchId?: string;
  consensusBranchName?: string;
  locktime: number;
  expiryHeight?: number;
  vin: ParsedVin[];
  vout: ParsedVout[];
  valueBalanceSapling?: number;
  nSpendsSapling: number;
  nOutputsSapling: number;
  orchardActions: number;
  valueBalanceOrchard?: number;
  orchardFlags?: number;
  size: number;
}

/**
 * A simple byte reader over a hex string
 */
class HexReader {
  private hex: string;
  private pos: number;

  constructor(hex: string) {
    this.hex = hex.toLowerCase();
    this.pos = 0;
  }

  remaining(): number {
    return (this.hex.length - this.pos) / 2;
  }

  readBytes(n: number): string {
    if (this.pos + n * 2 > this.hex.length) {
      throw new Error(`Unexpected end of transaction data at byte ${this.pos / 2}, need ${n} more bytes`);
    }
    const slice = this.hex.slice(this.pos, this.pos + n * 2);
    this.pos += n * 2;
    return slice;
  }

  readUInt8(): number {
    const hex = this.readBytes(1);
    return parseInt(hex, 16);
  }

  readUInt16LE(): number {
    const hex = this.readBytes(2);
    return parseInt(hex.slice(2, 4) + hex.slice(0, 2), 16);
  }

  readUInt32LE(): number {
    const hex = this.readBytes(4);
    const bytes = [hex.slice(6, 8), hex.slice(4, 6), hex.slice(2, 4), hex.slice(0, 2)];
    return parseInt(bytes.join(''), 16);
  }

  readInt64LE(): number {
    const hex = this.readBytes(8);
    const bytes = [];
    for (let i = 14; i >= 0; i -= 2) {
      bytes.push(hex.slice(i, i + 2));
    }
    const val = BigInt('0x' + bytes.join(''));
    // Handle signed interpretation for value balance fields
    if (val > BigInt('0x7fffffffffffffff')) {
      return Number(val - BigInt('0x10000000000000000'));
    }
    return Number(val);
  }

  readUInt64LE(): number {
    const hex = this.readBytes(8);
    const bytes = [];
    for (let i = 14; i >= 0; i -= 2) {
      bytes.push(hex.slice(i, i + 2));
    }
    return Number(BigInt('0x' + bytes.join('')));
  }

  readCompactSize(): number {
    const first = this.readUInt8();
    if (first < 253) return first;
    if (first === 253) return this.readUInt16LE();
    if (first === 254) return this.readUInt32LE();
    return this.readUInt64LE();
  }

  readHash(): string {
    const hex = this.readBytes(32);
    // Reverse byte order for display (internal byte order -> display order)
    const bytes = [];
    for (let i = 62; i >= 0; i -= 2) {
      bytes.push(hex.slice(i, i + 2));
    }
    return bytes.join('');
  }

  skip(n: number): void {
    if (this.pos + n * 2 > this.hex.length) {
      throw new Error(`Cannot skip ${n} bytes at position ${this.pos / 2}`);
    }
    this.pos += n * 2;
  }
}

/**
 * Derive a transparent address from a scriptPubKey hex
 */
function deriveAddressFromScript(scriptHex: string, isTestnet: boolean): { type: string; address?: string } {
  // P2PKH: OP_DUP OP_HASH160 <20 bytes> OP_EQUALVERIFY OP_CHECKSIG
  // 76 a9 14 <40 hex chars> 88 ac
  if (scriptHex.length === 50 && scriptHex.startsWith('76a914') && scriptHex.endsWith('88ac')) {
    const pubkeyHash = scriptHex.slice(6, 46);
    const prefix = isTestnet ? '1d25' : '1cb8'; // t1... for mainnet, tm... for testnet
    return { type: 'pubkeyhash', address: base58checkEncode(prefix, pubkeyHash) };
  }

  // P2SH: OP_HASH160 <20 bytes> OP_EQUAL
  // a9 14 <40 hex chars> 87
  if (scriptHex.length === 46 && scriptHex.startsWith('a914') && scriptHex.endsWith('87')) {
    const scriptHash = scriptHex.slice(4, 44);
    const prefix = isTestnet ? '1cba' : '1cbd'; // t3... for mainnet, t2... for testnet
    return { type: 'scripthash', address: base58checkEncode(prefix, scriptHash) };
  }

  // OP_RETURN (nulldata)
  if (scriptHex.startsWith('6a')) {
    return { type: 'nulldata' };
  }

  return { type: 'nonstandard' };
}

/**
 * Base58Check encode with a 2-byte version prefix
 */
function base58checkEncode(versionHex: string, payloadHex: string): string {
  const data = hexToBytes(versionHex + payloadHex);
  const hash1 = sha256(data);
  const hash2 = sha256(hash1);
  const checksum = hash2.slice(0, 4);
  const fullPayload = new Uint8Array(data.length + 4);
  fullPayload.set(data);
  fullPayload.set(checksum, data.length);
  return base58Encode(fullPayload);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * SHA-256 using Web Crypto (sync fallback with manual implementation)
 * Since we need synchronous hashing for base58check, we use a JS implementation
 */
function sha256(data: Uint8Array): Uint8Array {
  // Simple SHA-256 implementation for address derivation
  const K: number[] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  const msgLen = data.length;
  const bitLen = msgLen * 8;
  const padLen = ((56 - (msgLen + 1) % 64) + 64) % 64;
  const padded = new Uint8Array(msgLen + 1 + padLen + 8);
  padded.set(data);
  padded[msgLen] = 0x80;
  // Length in bits as big-endian 64-bit
  for (let i = 0; i < 8; i++) {
    padded[padded.length - 1 - i] = (bitLen >>> (i * 8)) & 0xff;
  }

  const rotr = (x: number, n: number) => ((x >>> n) | (x << (32 - n))) >>> 0;

  for (let offset = 0; offset < padded.length; offset += 64) {
    const w = new Array(64);
    for (let i = 0; i < 16; i++) {
      w[i] = ((padded[offset + i * 4] << 24) | (padded[offset + i * 4 + 1] << 16) |
              (padded[offset + i * 4 + 2] << 8) | padded[offset + i * 4 + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i-15], 7) ^ rotr(w[i-15], 18) ^ (w[i-15] >>> 3);
      const s1 = rotr(w[i-2], 17) ^ rotr(w[i-2], 19) ^ (w[i-2] >>> 10);
      w[i] = (w[i-16] + s0 + w[i-7] + s1) >>> 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }

  const result = new Uint8Array(32);
  [h0, h1, h2, h3, h4, h5, h6, h7].forEach((v, i) => {
    result[i * 4] = (v >>> 24) & 0xff;
    result[i * 4 + 1] = (v >>> 16) & 0xff;
    result[i * 4 + 2] = (v >>> 8) & 0xff;
    result[i * 4 + 3] = v & 0xff;
  });
  return result;
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(data: Uint8Array): string {
  let num = BigInt(0);
  for (const byte of data) {
    num = num * BigInt(256) + BigInt(byte);
  }

  let encoded = '';
  while (num > 0) {
    const remainder = Number(num % BigInt(58));
    num = num / BigInt(58);
    encoded = BASE58_ALPHABET[remainder] + encoded;
  }

  // Leading zeros
  for (const byte of data) {
    if (byte === 0) {
      encoded = '1' + encoded;
    } else {
      break;
    }
  }

  return encoded;
}

/**
 * Detect if a transaction is testnet based on output addresses
 */
function detectTestnet(vout: ParsedVout[]): boolean {
  for (const out of vout) {
    if (out.scriptPubKey.address) {
      if (out.scriptPubKey.address.startsWith('tm') || out.scriptPubKey.address.startsWith('t2')) return true;
      if (out.scriptPubKey.address.startsWith('t1') || out.scriptPubKey.address.startsWith('t3')) return false;
    }
  }
  return false;
}

/**
 * Parse a raw Zcash transaction hex string into structured data.
 * Supports v1 through v5 transaction formats.
 */
export function parseZcashTransaction(hex: string): ParsedTransaction {
  const cleanHex = hex.replace(/\s/g, '').toLowerCase();
  if (!/^[0-9a-f]+$/.test(cleanHex)) {
    throw new Error('Invalid hex string');
  }
  if (cleanHex.length < 20) {
    throw new Error('Transaction hex is too short');
  }

  const reader = new HexReader(cleanHex);
  const totalSize = cleanHex.length / 2;

  // Read header (4 bytes): low 31 bits = version, high bit = fOverwintered
  const header = reader.readUInt32LE();
  const fOverwintered = (header & 0x80000000) !== 0;
  const version = header & 0x7fffffff;

  if (version < 1 || version > 5) {
    throw new Error(`Unsupported transaction version: ${version}`);
  }

  const tx: ParsedTransaction = {
    version,
    fOverwintered,
    locktime: 0,
    vin: [],
    vout: [],
    nSpendsSapling: 0,
    nOutputsSapling: 0,
    orchardActions: 0,
    size: totalSize,
  };

  // V5 transactions (NU5+) have a different field ordering per ZIP-225
  if (version === 5 && fOverwintered) {
    return parseV5Transaction(reader, tx);
  }

  // V1-V4 (legacy and overwintered formats)
  return parseLegacyTransaction(reader, tx, version, fOverwintered);
}

/**
 * Parse a v5 (NU5) transaction per ZIP-225
 */
function parseV5Transaction(reader: HexReader, tx: ParsedTransaction): ParsedTransaction {
  // nVersionGroupId (4 bytes)
  const vgid = reader.readUInt32LE();
  tx.versionGroupId = '0x' + vgid.toString(16).padStart(8, '0');
  tx.versionGroupName = VERSION_GROUP_IDS[vgid] || 'Unknown';

  // nConsensusBranchId (4 bytes)
  const cbid = reader.readUInt32LE();
  tx.consensusBranchId = '0x' + cbid.toString(16).padStart(8, '0');
  tx.consensusBranchName = CONSENSUS_BRANCH_IDS[cbid] || 'Unknown';

  // lock_time (4 bytes)
  tx.locktime = reader.readUInt32LE();

  // nExpiryHeight (4 bytes)
  tx.expiryHeight = reader.readUInt32LE();

  // === Transparent ===
  const nVin = reader.readCompactSize();
  for (let i = 0; i < nVin; i++) {
    tx.vin.push(readTransparentInput(reader));
  }

  const nVout = reader.readCompactSize();
  // First pass without addresses (we detect testnet after)
  const rawVouts: { value: number; n: number; scriptHex: string }[] = [];
  for (let i = 0; i < nVout; i++) {
    const value = reader.readUInt64LE();
    const scriptLen = reader.readCompactSize();
    const scriptHex = reader.readBytes(scriptLen);
    rawVouts.push({ value, n: i, scriptHex });
  }

  // Detect testnet from script patterns and derive addresses
  const isTestnet = rawVouts.some(v => {
    if (v.scriptHex.length === 50 && v.scriptHex.startsWith('76a914') && v.scriptHex.endsWith('88ac')) {
      const addr = deriveAddressFromScript(v.scriptHex, true);
      return addr.address?.startsWith('tm');
    }
    return false;
  });

  for (const raw of rawVouts) {
    const { type, address } = deriveAddressFromScript(raw.scriptHex, isTestnet);
    tx.vout.push({
      value: raw.value / 1e8,
      n: raw.n,
      scriptPubKey: { hex: raw.scriptHex, type, address },
    });
  }

  // === Sapling ===
  const nSpendsSapling = reader.readCompactSize();
  tx.nSpendsSapling = nSpendsSapling;

  // Each sapling spend description (v5): cv(32) + nullifier(32) + rk(32) = 96 bytes
  for (let i = 0; i < nSpendsSapling; i++) {
    reader.skip(96);
  }

  const nOutputsSapling = reader.readCompactSize();
  tx.nOutputsSapling = nOutputsSapling;

  // Each sapling output description (v5): cv(32) + cmu(32) + ephemeralKey(32) + encCiphertext(580) + outCiphertext(80) = 756 bytes
  for (let i = 0; i < nOutputsSapling; i++) {
    reader.skip(756);
  }

  // valueBalanceSapling (8 bytes) - only if spends or outputs > 0
  if (nSpendsSapling > 0 || nOutputsSapling > 0) {
    tx.valueBalanceSapling = reader.readInt64LE() / 1e8;
  }

  // anchorSapling (32 bytes) - only if spends > 0
  if (nSpendsSapling > 0) {
    reader.skip(32);
  }

  // vSpendProofsSapling - 192 bytes each
  for (let i = 0; i < nSpendsSapling; i++) {
    reader.skip(192);
  }

  // vSpendAuthSigsSapling - 64 bytes each
  for (let i = 0; i < nSpendsSapling; i++) {
    reader.skip(64);
  }

  // vOutputProofsSapling - 192 bytes each
  for (let i = 0; i < nOutputsSapling; i++) {
    reader.skip(192);
  }

  // bindingSigSapling (64 bytes) - only if spends or outputs > 0
  if (nSpendsSapling > 0 || nOutputsSapling > 0) {
    reader.skip(64);
  }

  // === Orchard ===
  const nActionsOrchard = reader.readCompactSize();
  tx.orchardActions = nActionsOrchard;

  if (nActionsOrchard > 0) {
    // Each orchard action: cv(32) + nullifier(32) + rk(32) + cmx(32) + ephemeralKey(32) + encCiphertext(580) + outCiphertext(80) = 820 bytes
    for (let i = 0; i < nActionsOrchard; i++) {
      reader.skip(820);
    }

    // flagsOrchard (1 byte)
    tx.orchardFlags = reader.readUInt8();

    // valueBalanceOrchard (8 bytes)
    tx.valueBalanceOrchard = reader.readInt64LE() / 1e8;

    // anchorOrchard (32 bytes)
    reader.skip(32);

    // proofsOrchard: sizeProof (compactSize) + proof data
    const proofSize = reader.readCompactSize();
    reader.skip(proofSize);

    // vSpendAuthSigsOrchard - 64 bytes each
    for (let i = 0; i < nActionsOrchard; i++) {
      reader.skip(64);
    }

    // bindingSigOrchard (64 bytes)
    reader.skip(64);
  }

  return tx;
}

/**
 * Parse v1-v4 legacy/overwintered transactions
 */
function parseLegacyTransaction(reader: HexReader, tx: ParsedTransaction, version: number, fOverwintered: boolean): ParsedTransaction {
  // Version group ID (4 bytes) - only for overwintered (v3+)
  if (fOverwintered) {
    const vgid = reader.readUInt32LE();
    tx.versionGroupId = '0x' + vgid.toString(16).padStart(8, '0');
    tx.versionGroupName = VERSION_GROUP_IDS[vgid] || 'Unknown';
  }

  // Transparent inputs
  const nVin = reader.readCompactSize();
  for (let i = 0; i < nVin; i++) {
    tx.vin.push(readTransparentInput(reader));
  }

  // Transparent outputs
  const nVout = reader.readCompactSize();
  for (let i = 0; i < nVout; i++) {
    const value = reader.readUInt64LE();
    const scriptLen = reader.readCompactSize();
    const scriptHex = reader.readBytes(scriptLen);
    const { type, address } = deriveAddressFromScript(scriptHex, false);
    tx.vout.push({
      value: value / 1e8,
      n: i,
      scriptPubKey: { hex: scriptHex, type, address },
    });
  }

  // Locktime (4 bytes)
  tx.locktime = reader.readUInt32LE();

  // Expiry height (4 bytes) - only for overwintered
  if (fOverwintered) {
    tx.expiryHeight = reader.readUInt32LE();
  }

  // Sapling (v4 overwintered)
  if (version >= 4 && fOverwintered) {
    // valueBalanceSapling (8 bytes)
    tx.valueBalanceSapling = reader.readInt64LE() / 1e8;

    // Sapling spends
    const nSpends = reader.readCompactSize();
    tx.nSpendsSapling = nSpends;
    // Each v4 sapling spend: cv(32) + anchor(32) + nullifier(32) + rk(32) + proof(192) + spendAuthSig(64) = 384 bytes
    for (let i = 0; i < nSpends; i++) {
      reader.skip(384);
    }

    // Sapling outputs
    const nOutputs = reader.readCompactSize();
    tx.nOutputsSapling = nOutputs;
    // Each v4 sapling output: cv(32) + cmu(32) + ephemeralKey(32) + encCiphertext(580) + outCiphertext(80) + proof(192) = 948 bytes
    for (let i = 0; i < nOutputs; i++) {
      reader.skip(948);
    }
  }

  // JoinSplit (v2-v4)
  if (version >= 2) {
    const nJoinSplit = reader.readCompactSize();
    if (nJoinSplit > 0) {
      // Each joinsplit: 1802 bytes (v2/v3) or 1698 bytes (v4 with Groth16)
      const jsSize = version >= 4 ? 1698 : 1802;
      for (let i = 0; i < nJoinSplit; i++) {
        reader.skip(jsSize);
      }
      // joinSplitPubKey (32) + joinSplitSig (64)
      reader.skip(96);
    }
  }

  // bindingSig (64 bytes) - v4 with sapling data
  if (version >= 4 && fOverwintered && (tx.nSpendsSapling > 0 || tx.nOutputsSapling > 0)) {
    reader.skip(64);
  }

  return tx;
}

function readTransparentInput(reader: HexReader): ParsedVin {
  const txid = reader.readHash();
  const vout = reader.readUInt32LE();
  const scriptLen = reader.readCompactSize();

  // Coinbase detection: txid is all zeros and vout is 0xffffffff
  const isCoinbase = txid === '0'.repeat(64) && vout === 0xffffffff;
  const scriptHex = reader.readBytes(scriptLen);
  const sequence = reader.readUInt32LE();

  if (isCoinbase) {
    return { txid, vout, scriptSig: { hex: scriptHex }, sequence, coinbase: scriptHex };
  }

  return { txid, vout, scriptSig: { hex: scriptHex }, sequence };
}
