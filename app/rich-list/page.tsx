import { API_CONFIG } from '@/lib/api-config';
import RichListClient, {
  type Concentration,
  type PaginationData,
  type RichListEntry,
} from './RichListClient';

export const dynamic = 'force-dynamic';

interface InitialRichList {
  addresses: RichListEntry[];
  concentration: Concentration | null;
  pagination: PaginationData | null;
}

async function getInitialRichList(): Promise<InitialRichList> {
  try {
    const response = await fetch(
      `${API_CONFIG.POSTGRES_API_URL}/api/rich-list?limit=100&offset=0`,
      { next: { revalidate: 60 } },
    );
    if (!response.ok) {
      return { addresses: [], concentration: null, pagination: null };
    }

    const data = await response.json() as {
      success?: boolean;
      addresses?: RichListEntry[];
      concentration?: Concentration;
      pagination?: PaginationData;
    };
    if (data.success !== true
      || !Array.isArray(data.addresses)
      || !data.concentration
      || !data.pagination) {
      return { addresses: [], concentration: null, pagination: null };
    }

    return {
      addresses: data.addresses,
      concentration: data.concentration,
      pagination: data.pagination,
    };
  } catch (error) {
    console.error('Error fetching initial rich list:', error);
    return { addresses: [], concentration: null, pagination: null };
  }
}

export default async function RichListPage() {
  const initial = await getInitialRichList();
  return (
    <RichListClient
      initialAddresses={initial.addresses}
      initialConcentration={initial.concentration}
      initialPagination={initial.pagination}
    />
  );
}
