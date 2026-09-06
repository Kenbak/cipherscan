import { buildPageMetadata, getBaseUrl } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Crosschain - ZEC Cross-Chain Swap Analytics | ZecBlock',
  description: 'Track ZEC cross-chain swaps via NEAR Intents. Monitor swap volumes, latency, and flow directions for indexed routes involving ZEC, with clear venue coverage.',
  keywords: ['zcash crosschain', 'ZEC swaps', 'NEAR Intents', 'zcash bridge', 'ZEC cross-chain', 'zcash swap volume', 'ZEC latency'],
  path: '/crosschain',
  networks: ['mainnet'],
});

export default function CrosschainLayout({ children }: { children: React.ReactNode }) {
  const url = `${getBaseUrl()}/crosschain`;
  const schema = {'@context':'https://schema.org','@type':'WebPage','@id':`${url}#webpage`,url,name:metadata.title,description:metadata.description,isPartOf:{'@id':`${getBaseUrl()}/#website`}};
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(schema).replace(/</g,'\\u003c')}} />{children}</>;
}
