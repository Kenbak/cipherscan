import { notFound } from 'next/navigation';
import { isMainnet } from '@/lib/config';
import SwapClient from './SwapClient';

export default function SwapPage() {
  if (!isMainnet) notFound();
  return <SwapClient />;
}
