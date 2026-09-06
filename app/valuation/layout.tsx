import { buildPageMetadata, getBaseUrl } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Zcash Valuation & Market Context | ZecBlock',
  description:
    'Current ZEC price, modeled MVRV and realized price, transparent spending behavior, shielded supply and Google Trends context with clear dates and data limitations.',
  keywords: [
    'zcash MVRV',
    'zcash realized price',
    'zcash valuation',
    'zcash SOPR',
    'zcash NUPL',
    'on-chain analytics zcash',
  ],
  path: '/valuation',
  networks: ['mainnet'],
  imageAlt: 'ZecBlock Zcash on-chain valuation metrics',
});

export default function ValuationLayout({ children }: { children: React.ReactNode }) {
  const url = `${getBaseUrl()}/valuation`;
  const schema = {'@context':'https://schema.org','@type':'WebPage','@id':`${url}#webpage`,url,name:metadata.title,description:metadata.description,isPartOf:{'@id':`${getBaseUrl()}/#website`}};
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(schema).replace(/</g,'\\u003c')}} />{children}</>;
}
