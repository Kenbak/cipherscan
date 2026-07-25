import BlocksPage, { generateMetadata as generateBlocksMetadata } from '../page';

export const revalidate = 30;

export async function generateMetadata() {
  return generateBlocksMetadata({ searchParams: Promise.resolve({}) });
}

export default function LatestBlocksPage() {
  return BlocksPage({
    searchParams: Promise.resolve({}),
    unavailablePolicy: 'throw',
  });
}
