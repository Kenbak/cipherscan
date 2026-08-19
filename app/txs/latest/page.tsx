import { renderTransactionsPage, generateMetadata as generateTransactionsMetadata } from '../page';

export const revalidate = 30;

export async function generateMetadata() {
  return generateTransactionsMetadata({ searchParams: Promise.resolve({}) });
}

export default function LatestTransactionsPage() {
  return renderTransactionsPage(Promise.resolve({}), 'shell');
}
