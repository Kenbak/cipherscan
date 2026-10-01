import { scheduledSeconds, type BlockSchedule } from './block-timing';
import { NETWORK_UPGRADES, type NetworkUpgrade } from './config';
import type { AppNetwork } from './network';

export type UpgradeSnapshot = {
  height: number;
  schedule: BlockSchedule & { nu7Height: number | null };
  observedBlockTime: number | null;
};

/** Validate the serving node's schedule, including its network identity. */
export function readUpgradeSnapshot(data: unknown, network: AppNetwork): UpgradeSnapshot | null {
  if (network === 'crosslink-testnet' || !data || typeof data !== 'object') return null;
  const stats = data as { blockchain?: { height?: unknown }; mining?: { schedule?: unknown; avgBlockTime?: unknown } };
  const height = stats.blockchain?.height;
  const schedule = stats.mining?.schedule as (BlockSchedule & { network?: string; source?: string; nu7Height?: unknown }) | undefined;
  if (typeof height !== 'number' || !Number.isSafeInteger(height) || height < 0 || height >= 500000000
    || schedule?.network !== (network === 'mainnet' ? 'main' : 'test')
    || schedule.source !== 'node-upgrade-schedule'
    || scheduledSeconds(schedule, height, height) === null) return null;
  const nu7Height = schedule.nu7Height;
  if (nu7Height !== null && (typeof nu7Height !== 'number' || !Number.isSafeInteger(nu7Height)
    || nu7Height <= 0 || nu7Height >= 500000000
    || !schedule.eras.some(era => era.height === nu7Height && era.seconds === 25))) return null;
  const avg = stats.mining?.avgBlockTime;
  return {
    height,
    schedule: { eras: schedule.eras, nu7Height: nu7Height as number | null },
    observedBlockTime: typeof avg === 'number' && Number.isFinite(avg) && avg > 0 ? avg : null,
  };
}

export function getBlockUpgrade(height: number, network: AppNetwork, snapshot: UpgradeSnapshot | null): NetworkUpgrade | null {
  if (network === 'crosslink-testnet') return null;
  if (snapshot?.schedule.nu7Height === height) {
    const label = network === 'testnet' ? 'testnet' : 'mainnet';
    return {
      name: 'NU7 activation', zip: '', badge: 'NU7 ACTIVATION',
      description: `The serving node announces Zcash ${label} NU7 activation at block #${height.toLocaleString('en-US')}. Activation follows the canonical chain; the arrival time is an estimate.`,
      link: '/network#network-accounting', linkText: 'View network upgrade details →',
    };
  }
  // Historical milestone heights belong to their own network.
  if (network === 'testnet' ? height !== 4134000 : height === 4134000) return null;
  return NETWORK_UPGRADES[height] ?? null;
}

export function estimateBlockArrival(snapshot: UpgradeSnapshot | null, target: number): { seconds: number; basis: 'recent block times' | 'target spacing' } | null {
  if (!snapshot) return null;
  const seconds = scheduledSeconds(snapshot.schedule, snapshot.height, target);
  if (seconds === null) return null;
  const targetInterval = snapshot.schedule.eras.findLast(era => era.height <= snapshot.height)?.seconds;
  if (snapshot.observedBlockTime !== null && targetInterval) {
    return { seconds: seconds * snapshot.observedBlockTime / targetInterval, basis: 'recent block times' };
  }
  return { seconds, basis: 'target spacing' };
}

export function formatUpgradeDuration(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor(seconds % 86400 / 3600)}h`;
}
