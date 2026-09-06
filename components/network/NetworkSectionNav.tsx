import Link from 'next/link';

export function NetworkSectionNav({ onTechnicalNavigate }: { onTechnicalNavigate: () => void }) {
  return (
    <nav aria-label="Network page sections" className="flex flex-wrap items-center gap-x-5 gap-y-3 text-caption font-mono text-muted mb-6 pb-4 border-b border-cipher-border">
      <a href="#network-nodes" className="hover:text-primary">Nodes</a>
      <a href="#network-activity" className="hover:text-primary">Activity</a>
      <a href="#network-protocol" className="hover:text-primary">Protocol</a>
      <a href="#network-technical" onClick={onTechnicalNavigate} className="hover:text-primary">Technical details</a>
      <Link href="/network/nodes" className="sm:ml-auto text-secondary hover:text-cipher-gold">Node explorer →</Link>
    </nav>
  );
}
