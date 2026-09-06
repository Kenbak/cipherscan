import { PageHeader } from '@/components/ui/SectionHeader';
import ValuationClient from './ValuationClient';
export default function ValuationPage() {
  return <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
    <PageHeader eyebrow="ON_CHAIN_VALUATION" title="Zcash Valuation & Market Context" subtitle="Current market data, modeled cost basis, spending behavior and search interest — with sources, dates and coverage made explicit." />
    <ValuationClient />
  </div>;
}
