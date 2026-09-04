import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Simple in-memory rate limiter
// Format: Map<IP, { count: number, resetTime: number }>
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

// Rate limit config
const RATE_LIMIT = {
  windowMs: 60 * 1000, // 1 minute window
  maxRequests: 300, // 300 requests per minute per IP (5 req/sec)
};

// Cleanup old entries every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of rateLimitMap.entries()) {
    if (now > data.resetTime) {
      rateLimitMap.delete(ip);
    }
  }
}, 5 * 60 * 1000);

function handleApiRateLimit(request: NextRequest): NextResponse {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  const now = Date.now();

  let userData = rateLimitMap.get(ip);

  if (!userData || now > userData.resetTime) {
    userData = {
      count: 1,
      resetTime: now + RATE_LIMIT.windowMs,
    };
    rateLimitMap.set(ip, userData);
  } else if (userData.count >= RATE_LIMIT.maxRequests) {
    return new NextResponse(
      JSON.stringify({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Maximum ${RATE_LIMIT.maxRequests} requests per minute.`,
        retryAfter: Math.ceil((userData.resetTime - now) / 1000),
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': Math.ceil((userData.resetTime - now) / 1000).toString(),
          'X-RateLimit-Limit': RATE_LIMIT.maxRequests.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': userData.resetTime.toString(),
        },
      }
    );
  } else {
    userData.count++;
  }

  const response = NextResponse.next();
  const remaining = Math.max(0, RATE_LIMIT.maxRequests - userData.count);

  response.headers.set('X-RateLimit-Limit', RATE_LIMIT.maxRequests.toString());
  response.headers.set('X-RateLimit-Remaining', remaining.toString());
  response.headers.set('X-RateLimit-Reset', userData.resetTime.toString());

  return response;
}

const CANONICAL_HOST = 'cipherscan.app';
const REDIRECT_HOSTS = [
  'zecexplorer.com',
  'www.zecexplorer.com',
  'zecblock.com',
  'www.zecblock.com',
  'zecblocks.com',
  'www.zecblocks.com',
  'zblockexplorer.com',
  'www.zblockexplorer.com',
  'zcashblock.com',
  'www.zcashblock.com',
  'zcashblocks.com',
  'www.zcashblocks.com',
];

export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV === 'development') {
    return NextResponse.next();
  }

  const host = request.headers.get('host')?.replace(/:\d+$/, '') || '';
  if (REDIRECT_HOSTS.includes(host)) {
    const url = new URL(request.nextUrl.pathname + request.nextUrl.search, `https://${CANONICAL_HOST}`);
    return NextResponse.redirect(url, 301);
  }

  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/api/')) {
    return handleApiRateLimit(request);
  }

  const blockMatch = pathname.match(/^\/block\/(\d+)$/);
  if (blockMatch) {
    const response = NextResponse.next();
    response.headers.set(
      'CDN-Cache-Control',
      'public, s-maxage=3600, stale-while-revalidate=86400',
    );
    response.headers.set(
      'Vercel-CDN-Cache-Control',
      'public, s-maxage=3600, stale-while-revalidate=86400',
    );
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*', '/block/:path*'],
};
