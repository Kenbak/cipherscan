export type ShieldedPoolKey = 'ironwood' | 'orchard' | 'sapling' | 'sprout';

export interface PoolConfig {
  key: ShieldedPoolKey;
  label: string;
  badgeColor: 'amber' | 'purple' | 'cyan' | 'orange' | 'green';
  textClass: string;
  bgClass: string;
}

export const SHIELDED_POOLS: PoolConfig[] = [
  { key: 'ironwood', label: 'Ironwood', badgeColor: 'amber', textClass: 'text-cipher-yellow', bgClass: 'bg-cipher-yellow' },
  { key: 'orchard', label: 'Orchard', badgeColor: 'green', textClass: 'text-cipher-green', bgClass: 'bg-cipher-green' },
  { key: 'sapling', label: 'Sapling', badgeColor: 'cyan', textClass: 'text-cipher-cyan', bgClass: 'bg-cipher-cyan' },
  { key: 'sprout', label: 'Sprout', badgeColor: 'orange', textClass: 'text-cipher-purple', bgClass: 'bg-cipher-purple' },
];

export function getPoolConfig(key: string): PoolConfig | undefined {
  return SHIELDED_POOLS.find(p => p.key === key);
}

/**
 * Determine the dominant pool badge for a transaction with boolean pool flags.
 * Priority: Ironwood > Orchard > Sapling > Sprout
 */
export function getDominantPool(tx: {
  has_ironwood?: boolean;
  has_orchard?: boolean;
  has_sapling?: boolean;
  has_sprout?: boolean;
}): ShieldedPoolKey | null {
  if (tx.has_ironwood) return 'ironwood';
  if (tx.has_orchard) return 'orchard';
  if (tx.has_sapling) return 'sapling';
  if (tx.has_sprout) return 'sprout';
  return null;
}

/**
 * Returns an array of all pools present in a transaction.
 */
export function getActivePools(tx: {
  has_ironwood?: boolean;
  has_orchard?: boolean;
  has_sapling?: boolean;
  has_sprout?: boolean;
}): ShieldedPoolKey[] {
  const pools: ShieldedPoolKey[] = [];
  if (tx.has_ironwood) pools.push('ironwood');
  if (tx.has_orchard) pools.push('orchard');
  if (tx.has_sapling) pools.push('sapling');
  if (tx.has_sprout) pools.push('sprout');
  return pools;
}
