import { NextResponse } from 'next/server';
import { usePostgresApi, getApiUrl } from '@/lib/api-config';

/**
 * API Route: Get Privacy Statistics
 * GET /api/privacy-stats
 *
 * Returns real-time privacy metrics from PostgreSQL:
 * - Shielded vs Transparent transaction ratio
 * - Privacy score (0-100)
 * - Total transactions
 *
 * OPTIMIZED: Calculates stats in ~10-50ms using SQL query
 * (Previously: 30-60 minutes with RPC calls)
 *
 * CACHE: 5 minutes (stats are real-time but cached for performance)
 */
export async function GET() {
  try {
    // For testnet, call Express API directly; for mainnet, fallback to old method
    const apiUrl = usePostgresApi()
      ? `${getApiUrl()}/api/privacy-stats`
      : process.env.PRIVACY_STATS_API_URL;

    if (!apiUrl) {
      console.error('❌ [PRIVACY STATS] API URL not configured');
      return NextResponse.json(
        {
          error: 'Privacy stats not configured',
          message: 'API URL not set.',
        },
        { status: 500 }
      );
    }

    const response = await fetch(apiUrl, {
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ [PRIVACY STATS] Error response:', errorText);
      return NextResponse.json(
        {
          error: 'Privacy stats not available',
          message: 'Failed to fetch stats from database.',
        },
        { status: 503 }
      );
    }

    const stats = await response.json();

    // Check if stats are stale (>48 hours old)
    const lastUpdated = new Date(stats.lastUpdated);
    const hoursSinceUpdate = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60);

    if (hoursSinceUpdate > 48) {
      console.warn(`⚠️  Privacy stats are ${hoursSinceUpdate.toFixed(0)}h old`);
    }

    // Return stats with cache headers
    return NextResponse.json(
      {
        success: true,
        data: stats,
        meta: {
          lastUpdated: stats.lastUpdated,
          dataAge: `${hoursSinceUpdate.toFixed(1)} hours ago`,
          source: usePostgresApi() ? 'PostgreSQL (real-time)' : 'JSON cache',
        },
      },
      {
        headers: {
          // Cache for 5 minutes
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
          'CDN-Cache-Control': 'public, s-maxage=300',
          'X-Stats-Age': hoursSinceUpdate.toFixed(1),
          'X-Data-Source': usePostgresApi() ? 'postgres' : 'cache',
        },
      }
    );
  } catch (error) {
    console.error('Error loading privacy stats:', error);
    return NextResponse.json(
      {
        error: 'Failed to load privacy stats',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
