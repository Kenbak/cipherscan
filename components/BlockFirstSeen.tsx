/** Collector receipt time is separate from the miner-provided header timestamp. */
export function BlockFirstSeen({ value }: { value?: string | null }) {
  const date = value ? new Date(value) : null;
  const iso = date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
  return (
    <div className="text-xs font-mono text-secondary">
      <span className="block text-caption text-muted uppercase">First seen by CipherScan (UTC)</span>
      {iso ? <time dateTime={iso}>{iso.replace('T', ' ').replace('Z', ' UTC')}</time> : 'Not recorded'}
    </div>
  );
}

export const BLOCK_FIRST_SEEN_EXPLANATION = 'First seen records when CipherScan received our local node’s tip response, polled every second. RPC latency, outages and missed tips can delay or prevent observation; this is not the node’s peer-arrival time. Older blocks may have no observation.';
