import { NextResponse } from 'next/server';
import { getCrosslinkStats } from '@/lib/crosslink';

export async function GET() {
  try {
    const stats = await getCrosslinkStats();

    if (!stats) {
      return NextResponse.json(
        { success: false, error: 'Crosslink RPC not configured or unavailable' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { success: true, ...stats },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=5',
        },
      }
    );
  } catch (error) {
    console.error('Crosslink stats API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch crosslink stats' },
      { status: 500 }
    );
  }
}
