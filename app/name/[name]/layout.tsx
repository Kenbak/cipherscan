import type { Metadata } from 'next';
import { getBaseUrl } from '@/lib/seo';

type Props = {
  params: Promise<{ name: string }>;
  children: React.ReactNode;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { name } = await params;
  const baseUrl = getBaseUrl();

  const title = `${name} — ZNS Name | CipherScan`;
  const description = `View Zcash Name Service (ZNS) details for "${name}" — resolved address, registration info, event history, and marketplace status on CipherScan.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${baseUrl}/name/${name}`,
      siteName: 'CipherScan',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
    alternates: {
      canonical: `${baseUrl}/name/${name}`,
    },
  };
}

export default function NameLayout({ children }: { children: React.ReactNode }) {
  return children;
}
