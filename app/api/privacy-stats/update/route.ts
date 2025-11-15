import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    // Security: Only allow requests from localhost or with a secret key
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.PRIVACY_STATS_UPDATE_TOKEN || 'dev-token-change-me';

    if (authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Trigger the privacy stats calculation script on the RPC server
    const updateUrl = process.env.PRIVACY_STATS_UPDATE_URL;

    if (!updateUrl) {
      return NextResponse.json(
        { success: false, error: 'PRIVACY_STATS_UPDATE_URL not configured' },
        { status: 500 }
      );
    }

    const response = await fetch(updateUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${expectedToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Update failed: ${response.statusText}`);
    }

    const result = await response.json();

    return NextResponse.json({
      success: true,
      message: 'Privacy stats update triggered',
      data: result,
    });

  } catch (error: any) {
    console.error('Error triggering privacy stats update:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to trigger update'
      },
      { status: 500 }
    );
  }
}
