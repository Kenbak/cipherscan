/**
 * Zcash Blockchain Service
 * Connects to lightwalletd to fetch blockchain data
 */

const LIGHTWALLETD_HOST = process.env.NEXT_PUBLIC_LIGHTWALLETD_HOST || 'lightwalletd.testnet.electriccoin.co';
const LIGHTWALLETD_PORT = process.env.NEXT_PUBLIC_LIGHTWALLETD_PORT || '9067';

export interface AddressBalance {
  address: string;
  balance: number;
  type: 'shielded' | 'transparent' | 'unified';
  transactions: TransactionInfo[];
}

export interface TransactionInfo {
  txid: string;
  timestamp: number;
  amount: number;
  type: 'received' | 'sent';
  memo?: string;
  blockHeight: number;
}

export interface BlockInfo {
  height: number;
  hash: string;
  timestamp: number;
  transactions: number;
  size: number;
}

/**
 * Detect address type from its prefix
 */
export function detectAddressType(address: string): 'shielded' | 'transparent' | 'unified' | 'invalid' {
  if (address.startsWith('utest') || address.startsWith('u1')) {
    return 'unified';
  }
  if (address.startsWith('ztestsapling') || address.startsWith('zs')) {
    return 'shielded';
  }
  // Transparent addresses: tm (testnet P2PKH), t1 (mainnet P2PKH), t2 (testnet P2SH), t3 (mainnet P2SH)
  if (address.startsWith('tm') || address.startsWith('t1') || address.startsWith('t2') || address.startsWith('t3')) {
    return 'transparent';
  }
  return 'invalid';
}

/**
 * Extract transparent address from Unified Address
 * Unified Addresses contain multiple receiver types (transparent, sapling, orchard)
 * We need to decode the UA and extract the transparent P2PKH receiver
 *
 * Format: Unified Address uses Bech32m encoding with typecodes:
 * - 0x00: P2PKH (transparent)
 * - 0x01: P2SH (transparent)
 * - 0x02: Sapling
 * - 0x03: Orchard
 */
export function extractTransparentFromUnified(unifiedAddress: string): string | null {
  try {
    // For now, we'll use a simple approach:
    // Make an RPC call to z_validateaddress which can decode the UA
    // This will be handled in the API route
    return null;
  } catch (error) {
    console.error('Error extracting transparent address:', error);
    return null;
  }
}

/**
 * Get address balance and transaction history
 * TODO: Implement real lightwalletd connection
 */
export async function getAddressInfo(address: string): Promise<AddressBalance | null> {
  try {
    const type = detectAddressType(address);

    if (type === 'invalid') {
      return null;
    }

    // Mock data for now
    // In production, this would call lightwalletd gRPC API
    return {
      address,
      balance: 0.0,
      type,
      transactions: [],
    };
  } catch (error) {
    console.error('Error fetching address info:', error);
    return null;
  }
}

/**
 * Get recent blocks
 * TODO: Implement real lightwalletd connection
 */
export async function getRecentBlocks(limit: number = 10): Promise<BlockInfo[]> {
  try {
    // Mock data for now
    return [];
  } catch (error) {
    console.error('Error fetching blocks:', error);
    return [];
  }
}

/**
 * Get block by height
 * TODO: Implement real lightwalletd connection
 */
export async function getBlock(height: number): Promise<BlockInfo | null> {
  try {
    // Mock data for now
    return null;
  } catch (error) {
    console.error('Error fetching block:', error);
    return null;
  }
}

/**
 * Get transaction by ID
 * TODO: Implement real lightwalletd connection
 */
export async function getTransaction(txid: string): Promise<TransactionInfo | null> {
  try {
    // Mock data for now
    return null;
  } catch (error) {
    console.error('Error fetching transaction:', error);
    return null;
  }
}

/**
 * Format amount from zatoshi to ZEC/TAZ
 */
export function formatZcash(zatoshi: number): string {
  return (zatoshi / 100000000).toFixed(8);
}

/**
 * Format timestamp to readable date
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString();
}
