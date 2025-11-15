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

export function middleware(request: NextRequest) {
  // Skip rate limiting in development
  if (process.env.NODE_ENV === 'development') {
    return NextResponse.next();
  }

  // Only apply rate limiting to API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    // Get client IP from various sources (Next.js 15.5+ compatibility)
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';
    const now = Date.now();

    // Get or create rate limit data for this IP
    let userData = rateLimitMap.get(ip);

    if (!userData || now > userData.resetTime) {
      // Reset or create new window
      userData = {
        count: 1,
        resetTime: now + RATE_LIMIT.windowMs,
      };
      rateLimitMap.set(ip, userData);
    } else if (userData.count >= RATE_LIMIT.maxRequests) {
      // Rate limit exceeded
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
      // Increment request count
      userData.count++;
    }

    // Add rate limit headers to response
    const response = NextResponse.next();
    const remaining = Math.max(0, RATE_LIMIT.maxRequests - userData.count);

    response.headers.set('X-RateLimit-Limit', RATE_LIMIT.maxRequests.toString());
    response.headers.set('X-RateLimit-Remaining', remaining.toString());
    response.headers.set('X-RateLimit-Reset', userData.resetTime.toString());

    return response;
  }

  return NextResponse.next();
}

// Configure which routes use this middleware
export const config = {
  matcher: '/api/:path*',
};
