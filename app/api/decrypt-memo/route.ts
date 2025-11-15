import { NextRequest, NextResponse } from 'next/server';

// This API route is deprecated - memo decryption is now handled client-side with WASM
// Keeping this for backwards compatibility, but it just returns an error

export async function POST(request: NextRequest) {
  return NextResponse.json(
    {
      error: 'Server-side memo decryption is no longer supported. Memo decryption is now handled client-side in your browser for maximum privacy.',
      clientSideUrl: '/decrypt'
    },
    { status: 410 } // 410 Gone
  );
}
