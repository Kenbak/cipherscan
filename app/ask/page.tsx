import Link from 'next/link';
import { buildPageMetadata, getBaseUrl, getNetwork } from '@/lib/seo';
import { AskWorkspace } from './AskWorkspace';
import styles from './ask.module.css';

const description = 'Explore Zcash mainnet pool balances, public flows, tracked cross-chain swaps and Network Pulse alerts. Start with a question, inspect the source data, and refine your chart.';
export const metadata = buildPageMetadata({
  title: 'Ask ZecBlock — Explore Zcash Data', description, path: '/ask',
  index: true, networks: ['mainnet'], imageAlt: 'Ask ZecBlock — questions, source data and Zcash charts',
});

export default function AskPage() {
  const network = getNetwork();
  const url = `${getBaseUrl()}/ask`;
  const schema = { '@context': 'https://schema.org', '@type': 'WebPage', '@id': `${url}#webpage`, url,
    name: 'Ask ZecBlock', description, isPartOf: { '@id': `${getBaseUrl()}/#website` }, publisher: { '@id': 'https://zecblock.com/#organization' } };
  return <div className={`${styles.page} max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-7`}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }} />
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-cipher-border pb-6">
      <div><div className="flex items-center gap-3"><h1 className="text-2xl font-medium tracking-tight text-primary">Ask ZecBlock</h1><span className="border border-cipher-border rounded px-2 py-0.5 text-caption font-mono text-muted">PREVIEW</span></div>
        <p className="mt-2 max-w-2xl text-sm text-secondary">Ask questions about Zcash mainnet. Explore public network data and refine your charts.</p></div>
      <span className="flex items-center gap-2 text-caption font-mono text-muted pt-2"><span className="h-1.5 w-1.5 bg-brand-gold" aria-hidden="true" />MAINNET DATA</span>
    </header>
    {network === 'mainnet' ? <AskWorkspace /> : <div className="py-16"><h2 className="text-xl text-primary">Ask is available on mainnet</h2><p className="mt-3 text-secondary">This preview explores Zcash mainnet data. It does not query this network.</p><Link href="https://zecblock.com/ask" className="inline-block mt-6 text-cipher-gold hover:underline">Open Ask on mainnet →</Link></div>}
  </div>;
}
