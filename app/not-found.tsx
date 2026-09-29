import Link from 'next/link';
import { PageHeader } from '@/components/ui/SectionHeader';

export default function NotFound() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-16">
      {/* not-found.tsx cannot export metadata; React hoists these into <head>. Next adds noindex for 404s. */}
      <title>Page not found | ZecBlock</title>
      <meta name="description" content="This ZecBlock page does not exist. Search for a Zcash block, transaction or address instead." />
      <PageHeader eyebrow="404" title="Page not found" subtitle="This URL is unavailable. Check the link, or search for a block, transaction or address." />
      <nav aria-label="Explore ZecBlock" className="flex flex-wrap gap-3">
        <Link href="/" className="btn btn-md btn-primary">Explorer home</Link>
        <Link href="/blocks" className="btn btn-md btn-secondary">Latest blocks</Link>
        <Link href="/network" className="btn btn-md btn-secondary">Network</Link>
        <Link href="/docs" className="btn btn-md btn-secondary">API docs</Link>
      </nav>
    </div>
  );
}
