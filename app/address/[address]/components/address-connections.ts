/** Public transaction associations and inferred cluster membership are distinct evidence. */
export interface ConnectionPeer {
  address: string;
  balanceZec: number;
  txCount: number;
  label: string | null;
}
export interface ConnectionCounterparty {
  address: string;
  sentZec: number;
  receivedZec: number;
  txCount: number;
  label: string | null;
  sameEntity: boolean;
}
export interface ConnectionsResponse {
  address: string;
  cluster: { clusterId: number; memberCount: number } | null;
  peers: ConnectionPeer[];
  peerSelection?: 'full' | 'top_by_balance';
  counterparties: ConnectionCounterparty[];
  sampledRecentTxs?: number;
}
export interface ConnectionNode {
  id: string;
  label: string | null;
  peer?: ConnectionPeer;
  counterparty?: ConnectionCounterparty;
}
export function connectionNodes(data: ConnectionsResponse, mode: 'recent' | 'cluster'): ConnectionNode[] {
  const nodes = new Map<string, ConnectionNode>();
  const rows = mode === 'recent' ? data.counterparties : data.peers;
  for (const row of rows) {
    if (row.address === data.address || nodes.has(row.address)) continue;
    nodes.set(row.address, {
      id: row.address, label: row.label,
      peer: data.peers.find(peer => peer.address === row.address),
      counterparty: data.counterparties.find(peer => peer.address === row.address),
    });
  }
  return [...nodes.values()];
}
