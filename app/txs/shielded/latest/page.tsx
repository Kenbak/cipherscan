import ShieldedTransactionsPage, {
  generateMetadata as generateShieldedTransactionsMetadata,
} from '../page';

export const revalidate = 30;

export async function generateMetadata() {
  return generateShieldedTransactionsMetadata({ searchParams: Promise.resolve({}) });
}

export default function LatestShieldedTransactionsPage() {
  return ShieldedTransactionsPage({
    searchParams: Promise.resolve({}),
    unavailablePolicy: 'throw',
  });
}
