export interface CanonicalBlockSummary {
  height: number;
  hash: string;
  timestamp: number | null;
  transactionCount: number | null;
  size: number | null;
  minerAddress: string | null;
  minerPool: string | null;
  minerPoolUrl?: string | null;
  minerPoolRegion?: string | null;
}

export interface BlockData {
  height: number;
  hash: string;
  timestamp: number;
  transactions: any[];
  transactionCount: number;
  size: number;
  difficulty: number;
  confirmations: number;
  previousBlockHash?: string;
  nextBlockHash?: string;
  version?: number;
  merkleRoot?: string;
  finalSaplingRoot?: string;
  finalOrchardRoot?: string | null;
  finalIronwoodRoot?: string | null;
  bits?: string;
  nonce?: string;
  solution?: string;
  totalFees?: number;
  minerAddress?: string;
  minerPool?: string | null;
  minerPoolUrl?: string | null;
  minerPoolRegion?: string | null;
  finality?: string | null;
  isOrphaned?: boolean;
  orphanSource?: string | null;
  orphanDetectedAt?: string | null;
  canonicalBlock?: CanonicalBlockSummary | null;
  coinbaseHex?: string | null;
  coinbaseText?: string | null;
}

export interface BlockPageSummary {
  height: number;
  hash: string;
  isOrphaned: boolean;
}

export interface BlockPageClientProps {
  identifier: string;
  initialSummary: BlockPageSummary | null;
}
