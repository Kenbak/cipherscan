import TransactionsPage, { generateMetadata as generateTransactionsMetadata } from '../page';

export const revalidate = 30;

export async function generateMetadata() {
  return generateTransactionsMetadata({ searchParams: Promise.resolve({}) });
}

export default function LatestTransactionsPage() {
  return TransactionsPage({
    searchParams: Promise.resolve({}),
    unavailablePolicy: 'throw',
  });
}
