/**
 * Detect an address family from its prefix for routing/search hints only.
 * Authoritative checksum and receiver validation happens in the API and the
 * zcash_address WASM decoder; callers must not treat this as validation.
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
