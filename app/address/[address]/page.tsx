import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { detectAddressType } from '@/lib/zcash';
import { AddressDetailClient, AddressPageSuspenseFallback } from './components';

type Props = {
  params: Promise<{ address: string }>;
};

function isValidAddressSyntax(address: string): boolean {
  const type = detectAddressType(address);

  if (type === 'transparent') {
    return address.length === 35 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(address);
  }

  if (type === 'shielded') {
    return address.length === 78
      && /^(?:zs|ztestsapling)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+$/.test(address);
  }

  if (type === 'unified') {
    return address.length >= 16
      && address.length <= 512
      && /^(?:u|utest)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+$/.test(address);
  }

  return false;
}

export default async function AddressPage({ params }: Props) {
  const { address } = await params;

  if (!isValidAddressSyntax(address)) {
    notFound();
  }

  return (
    <Suspense fallback={<AddressPageSuspenseFallback />}>
      <AddressDetailClient address={address} />
    </Suspense>
  );
}
