/**
 * Known-finalizer label registry.
 *
 * Pubkeys are stored in DB byte order (raw, what zebrad RPC returns).
 * The `getFinalizerLabel()` helper accepts either DB-raw or GUI-display
 * form, so callers don't need to think about byte orientation.
 */

import { displayPubkey } from './utils';

export interface FinalizerLabel {
  /** Human-friendly name shown next to the pubkey. */
  name: string;
  /** Optional homepage / source link. */
  url?: string;
  /** Optional one-line description shown in tooltips / detail page. */
  description?: string;
}

/**
 * Registry. Keys MUST be lowercase, in DB-raw byte order (i.e. the form
 * stored in `finalizers.pub_key`). To add a label, look up the validator on
 * `/validators`, copy the pubkey, then run:
 *
 *     node -e "console.log(require('./lib/utils').displayPubkey('<gui-form>'))"
 *
 * to get the raw form, and add an entry below.
 */
const KNOWN_FINALIZERS: Record<string, FinalizerLabel> = {
  // CipherScan testnet finalizer (Atmosphere Labs).
  // GUI form: 79ce78ee4b5ce05b0fe11213941c4ed1584b09e57e6f15135006a46f2d98172c
  '2c17982d6fa4065013156f7ee5094b58d14e1c941312e10f5be05c4bee78ce79': {
    name: 'CipherScan',
    url: 'https://crosslink.cipherscan.app',
    description: 'Atmosphere Labs — Zcash explorer & Crosslink validator',
  },
  // Frontier Compute Cash.
  // GUI form: bb93fde13cfc03f430af8d03f9114f711897170c18192a3524e48251d8f77e64
  '647ef7d85182e424352a19180c179718714f11f9038daf30f403fc3ce1fd93bb': {
    name: 'Frontier',
    url: 'https://ctaz.frontiercompute.cash/',
    description: 'Frontier Compute Cash — community Crosslink validator',
  },
  // OrchardGuardian.
  // GUI form: fe8734cd0a2e8de4a0cdcc57500dafe8baceaecb9a7a2b53ba878969afd14a03
  '034ad1af698987ba532b7a9acbaecebae8af0d5057cccda0e48d2e0acd3487fe': {
    name: 'OrchardGuardian',
    description: 'Community Crosslink finalizer',
  },
  // TomZarebczan.
  // GUI form: e27c42be55137f8f2016aad25392f3bd60319a30bee0f5cfabec2a292bd26176
  '7661d22b292aecabcff5e0be309a3160bdf39253d2aa16208f7f1355be427ce2': {
    name: 'TomZarebczan',
    description: 'Community Crosslink finalizer',
  },
  // ZecHub.
  // GUI form: 22a05fd8a931a2df6cfd8a3c7e5fd0a321ce656770c4c694441b93f95a015bfe
  'fe5b015af9931b4494c6c4706765ce21a3d05f7e3c8afd6cdfa231a9d85fa022': {
    name: 'ZecHub',
    url: 'https://zechub.wiki/',
    description: 'Zcash community hub — Crosslink finalizer',
  },
};

/**
 * Resolve a label for a finalizer pubkey. Accepts either DB-raw or
 * GUI-display byte order; returns `null` if the pubkey is unknown.
 */
export function getFinalizerLabel(pubkey: string | null | undefined): FinalizerLabel | null {
  if (!pubkey) return null;
  const lower = pubkey.toLowerCase();
  if (KNOWN_FINALIZERS[lower]) return KNOWN_FINALIZERS[lower];
  // Try the opposite byte order
  const flipped = displayPubkey(lower);
  if (flipped !== lower && KNOWN_FINALIZERS[flipped]) {
    return KNOWN_FINALIZERS[flipped];
  }
  return null;
}
