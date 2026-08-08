import { getChartColors } from '@/lib/chart-theme';

export type ChartColors = ReturnType<typeof getChartColors>;

export interface Overview {
  success?: boolean;
  network?: string;
  activationHeight: number | null;
  tipHeight: number;
  activated: boolean;
  blocksUntilActivation: number;
  avgBlockTimeSecs?: number;
  poolSizes: {
    orchardZat: number;
    ironwoodZat: number;
    sproutZat: number;
    saplingZat: number;
    deferredZat: number;
    transparentZat: number | null;
    shieldedTotalZat: number;
    chainSupplyZat: number | null;
    updatedAt: string | null;
    source: 'zebra' | 'privacy_stats';
    sourceHeight: number;
    isLive: boolean;
  };
  migration: {
    totalMigratedZat: number;
    migratedTodayZat?: number;
    txCount: number;
    firstHeight: number | null;
    lastHeight: number | null;
    migratedPercent: number;
    velocityZatPerHour?: number;
  };
  supplyAudit: {
    orchardOutZat: number;
    coinbaseInZat: number;
    ironwoodInZat: number;
    ironwoodOutZat: number;
    indexedNetZat: number;
    authoritativePoolZat: number;
    differenceZat: number;
    accountingHeight: number;
    sourceHeight: number;
    status: 'balanced' | 'syncing' | 'stale' | 'mismatch';
    balanced: boolean | null;
  };
  supplyVerification?: {
    chainSupplyZat: number;
    verifiedZat: number;
    unverifiedZat: number;
    verifiedPct: number;
  };
  inflowSources?: {
    fromOrchardZat: number;
    fromOrchardTxs: number;
    fromSaplingZat: number;
    fromSaplingTxs: number;
    fromTransparentZat: number;
    fromTransparentTxs: number;
    fromCoinbaseZat: number;
    fromCoinbaseTxs: number;
    totalInZat: number;
    totalOutZat: number;
  };
}

export interface Cohort {
  boundary: number;
  boundaryStartHeight: number;
  txCount: number;
  volumeZat: number;
  firstTime: number | null;
}

export interface Cohorts {
  success?: boolean;
  network?: string;
  boundaryModulus: number;
  cohortCount: number;
  avgAnonymitySet: number;
  minAnonymitySet: number;
  maxAnonymitySet: number;
  cohorts: Cohort[];
}

export interface ScatterTx {
  txid: string;
  height: number;
  timestamp: number | null;
  amountZec: number;
  privacy: 'denominated' | 'distinctive';
  matchedDenomination: number | null;
  ironwoodActions?: number;
  orchardActions?: number;
  paddedBundle?: boolean;
  anchorCompliant?: boolean;
  fee?: number;
  expiryDelta?: number | null;
  family?: string;
  familyConfidence?: string;
  familyLabel?: string;
  familyShortLabel?: string;
}

export interface ScatterData {
  success?: boolean;
  network?: string;
  total: number;
  denominatedCount: number;
  distinctiveCount: number;
  denominatedPercent: number;
  denominatedVolumeZat?: number;
  distinctiveVolumeZat?: number;
  familyCounts?: Record<string, number>;
  txs: ScatterTx[];
}

export interface PoolRow {
  name: string;
  zat: number;
  pct: number;
  color?: string;
  highlight?: boolean;
  category: 'transparent' | 'shielded';
}

export interface VelocityBucket {
  label: string;
  ts: number;
  volume: number;
  txCount: number;
}

export type ActivityView = 'cohorts' | 'hourly' | 'daily';

export type PrivacyRange = '24h' | '7d' | '30d' | 'all';

export type PrivacyView = 'volume' | 'scatter' | 'denoms' | 'families';

export interface TierTx {
  t: number;
  h: number;
  a: number;
}

export type WalletStatus = 'zip318' | 'ready' | 'in_progress' | 'unknown';
