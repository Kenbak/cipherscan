import { notFound } from 'next/navigation';
import { isValidName, normalizeName } from '@/lib/name-validation';
import { resolveName, resolveNameExtras } from '@/lib/name-server';
import NameClient from './NameClient';

export default async function NamePage({ params }: { params: Promise<{ name: string }> }) {
  const { name: raw } = await params;
  const name = normalizeName(raw);
  if (!isValidName(name)) notFound();
  const resolution = await resolveName(name);
  const initialData = await resolveNameExtras(name, resolution);
  return <NameClient key={name} name={name} initialData={initialData} />;
}
