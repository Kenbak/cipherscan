import { ChartsClient } from './ChartsClient';
import { PageHeader } from '@/components/ui';
import { getBaseUrl } from '@/lib/seo';

export default function ChartsPage() {
  const url=`${getBaseUrl()}/charts`;
  const description='Explore Zcash supply, shielded activity, mining, valuation and cross-chain data. Compare observations, inspect their limits and share a chart.';
  const schema={'@context':'https://schema.org','@type':'CollectionPage','@id':`${url}#webpage`,url,name:'Zcash Charts & Analytics',description,isPartOf:{'@id':`${getBaseUrl()}/#website`},publisher:{'@id':'https://zecblock.com/#organization'}};
  return <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(schema).replace(/</g,'\\u003c')}}/>
    <PageHeader eyebrow="CHART_LIBRARY" title="Zcash Charts & Analytics" subtitle={description}/>
    <ChartsClient/>
  </main>;
}
