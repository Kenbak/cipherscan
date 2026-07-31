import { API_CONFIG } from '@/lib/api-config';
import { fetchWithDeadline } from '@/lib/server-fetch';
import { retainLastGoodOrBuildFallback } from '@/lib/isr-fallback';
import RichListClient, {
  type Concentration,
  type PaginationData,
  type RichListEntry,
} from './RichListClient';

export const revalidate = 60;

interface InitialRichList {
  addresses: RichListEntry[];
  concentration: Concentration | null;
  pagination: PaginationData | null;
}

const EMPTY_RICH_LIST: InitialRichList = {
  addresses: [],
  concentration: null,
  pagination: null,
};

async function getInitialRichList(): Promise<InitialRichList> {
  try {
    const response = await fetchWithDeadline(
      `${API_CONFIG.POSTGRES_API_URL}/api/rich-list?limit=100&offset=0`,
      { next: { revalidate: 60 } },
    );
    if (!response.ok) {
      throw new Error(`Rich list returned HTTP ${response.status}`);
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
      throw new Error('Rich list payload is malformed');
    }

    return {
      addresses: data.addresses,
      concentration: data.concentration,
      pagination: data.pagination,
    };
  } catch (error) {
    console.error('Error fetching initial rich list:', error);
    return retainLastGoodOrBuildFallback(EMPTY_RICH_LIST, error, 'rich list');
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
