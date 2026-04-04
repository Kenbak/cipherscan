import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/zns';

/**
 * API Route: Get name by ZNS lookup
 * GET /api/name/[name]
 *
 * CACHE STRATEGY:
 * - Registered names: 60 seconds cache (on-chain, rarely changes)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const zns = await getClient();
    const result = await zns.resolve(name);

    if (!result) {
      return NextResponse.json(
        { error: 'Name not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        'CDN-Cache-Control': 'public, s-maxage=60',
        'Vercel-CDN-Cache-Control': 'public, s-maxage=60',
        'X-Cache-Duration': '60s',
        'X-Data-Source': 'zns-indexer',
      },
    });
  } catch (error) {
    console.error('Error fetching name:', error);
    return NextResponse.json(
      { error: 'Failed to fetch name' },
      { status: 502 }
    );
  }
}
