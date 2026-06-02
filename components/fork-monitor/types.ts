export interface Anchor {
  height: number;
  label: string;
  cipherscan_hash: string | null;
  ctaz_hash: string | null;
  match: boolean | null;
}

export interface NodeRef {
  tip: number;
  tip_hash: string | null;
  peers: number;
  finalized: number;
  finality_gap: number;
}

export interface RegisteredNode {
  name: string;
  tip: number;
  tip_hash: string | null;
  sample_hashes?: { height: number; hash: string }[];
  peers: number | null;
  mining: boolean | null;
  ttl?: '1h' | '24h';
  branch: string;
  reported_at: number;
}

export interface ForkMonitorData {
  generated_at: string;
  cipherscan: NodeRef;
  ctaz: NodeRef | null;
  status: 'aligned' | 'diverged' | 'ctaz_unavailable';
  first_divergence: number | null;
  anchors: Anchor[];
  nodes: RegisteredNode[];
  split_hints: string[];
}

export interface CheckResult {
  height: number;
  cipherscan_hash: string | null;
  ctaz_hash: string | null;
  match: boolean | null;
}
