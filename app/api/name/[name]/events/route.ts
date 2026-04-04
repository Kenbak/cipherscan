import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/zns';

/**
 * API Route: Get event history for a ZNS name
 * GET /api/name/[name]/events
 *
 * CACHE STRATEGY:
 * - Events: 30 seconds cache (new events are infrequent but should appear promptly)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const zns = await getClient();
    const result = await zns.events({ name });

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
        'CDN-Cache-Control': 'public, s-maxage=30',
        'Vercel-CDN-Cache-Control': 'public, s-maxage=30',
        'X-Cache-Duration': '30s',
        'X-Data-Source': 'zns-indexer',
      },
    });
  } catch (error) {
    console.error('Error fetching name events:', error);
    return NextResponse.json(
      { error: 'Failed to fetch name events' },
      { status: 502 }
    );
  }
}
