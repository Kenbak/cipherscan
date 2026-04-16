import { NextResponse } from 'next/server';
import { API_CONFIG } from '@/lib/api-config';

export async function GET() {
  try {
    const apiUrl = API_CONFIG.POSTGRES_API_URL;
    const response = await fetch(`${apiUrl}/api/crosslink`, {
      next: { revalidate: 10 },
    });

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: 'Crosslink API unavailable' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=5',
      },
    });
  } catch (error) {
    console.error('Crosslink stats API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch crosslink stats' },
      { status: 500 }
    );
  }
}
