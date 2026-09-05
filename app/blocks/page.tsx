import BlocksPage, { generateMetadata as buildBlocksMetadata } from './BlocksPage';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export function generateMetadata(props: PageProps) {
  return buildBlocksMetadata(props);
}

export default function Page(props: PageProps) {
  return BlocksPage(props);
}
