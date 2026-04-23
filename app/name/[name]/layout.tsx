import type { Metadata } from 'next';
import { isValidName } from '@/lib/zns';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ name: string }>;
}): Promise<Metadata> {
  const { name: raw } = await params;
  const name = decodeURIComponent(raw).toLowerCase();

  if (!isValidName(name)) return { title: `${name} — CipherScan` };
  return { title: `${name} — CipherScan` };
}

export default function NameLayout({ children }: { children: React.ReactNode }) {
  return children;
}
