import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { resolveGovernanceRequest } from './lib/governance-request';
import { getConfiguredNetwork } from './lib/network';
import { CHART_CATALOG } from './lib/chart-catalog';
import { isValidName, normalizeName } from './lib/name-validation';

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

const CANONICAL_HOST = 'zecblock.com';
const REDIRECT_HOSTS = [
  'zecexplorer.com',
  'www.zecexplorer.com',
  'cipherscan.app',
  'www.cipherscan.app',
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

/**
 * Minimal branded page for responses the proxy must answer before the app's
 * loading boundary can stream a soft 200. Every argument is a fixed string
 * from this file; never pass request data into this template.
 */
function proxyErrorPage(title: string, message: string, link: { href: string; label: string }): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, follow"><title>${title} | ZecBlock</title><style>
:root{color-scheme:dark light;--bg:#0B0C0E;--text:#F1F3F5;--muted:#9CA4B0;--rule:#24272D;--gold:#F8BC21}
@media (prefers-color-scheme:light){:root{--bg:#F6F7F9;--text:#171A20;--muted:#59616D;--rule:#DFE3E9;--gold:#DB9E00}}
body{margin:0;min-height:100vh;display:flex;align-items:center;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,sans-serif}
main{width:100%;max-width:640px;margin:0 auto;padding:48px 24px}
.brand{display:inline-flex;align-items:center;gap:10px;margin-bottom:48px;color:var(--text);font-weight:600;text-decoration:none}
.brand i{width:14px;height:14px;background:var(--gold)}
.code{margin:0 0 12px;color:var(--muted);font:13px/1 ui-monospace,monospace;letter-spacing:.08em}
h1{margin:0 0 12px;font-size:32px;font-weight:500;letter-spacing:-.02em}
p{margin:0 0 32px;color:var(--muted)}
a.action{color:var(--text);text-underline-offset:4px}
</style></head><body><main><a class="brand" href="/"><i></i>ZecBlock</a><p class="code">&gt; ${title.toLowerCase()}</p><h1>${title}</h1><p>${message}</p><a class="action" href="${link.href}">${link.label} &rarr;</a></main></body></html>`;
}

export async function proxy(request: NextRequest) {
  const namePath = request.nextUrl.pathname.match(/^\/name\/(.*)$/);
  if (namePath && !isValidName(normalizeName(namePath[1]))) {
    return new NextResponse(proxyErrorPage('Name not found', 'Enter a valid Zcash Name.', { href: '/', label: 'Return to ZecBlock' }), {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, follow' },
    });
  }
  // Keep filtered archives dynamic and the unfiltered list on its ISR route.
  // Vercel permits at most 16 has/missing conditions per static routing rule.
  if (request.nextUrl.pathname === '/blocks') {
    const host = request.headers.get('host')?.replace(/:\d+$/, '') || '';
    if (process.env.NODE_ENV !== 'development' && REDIRECT_HOSTS.includes(host)) {
      return NextResponse.redirect(new URL(request.nextUrl.pathname + request.nextUrl.search, `https://${CANONICAL_HOST}`), 301);
    }
    const filterKeys = [
      'cursor', 'direction', 'page', 'software', 'pool', 'order', 'from', 'to',
      'min_height', 'max_height', 'min_interval', 'max_interval',
      'min_size', 'max_size', 'min_fees', 'max_fees', 'min_txs', 'max_txs',
    ];
    if (filterKeys.some((key) => request.nextUrl.searchParams.has(key))) {
      return NextResponse.next();
    }
    const url = request.nextUrl.clone();
    url.pathname = '/blocks/latest';
    return NextResponse.rewrite(url);
  }
  // Reject malformed block identifiers before a loading boundary can stream a
  // soft 200. Do not fetch or cache a missing-resource guess for these URLs.
  const blockPath = request.nextUrl.pathname.match(/^\/block\/([^/]+)$/);
  if (blockPath) {
    const id = blockPath[1];
    const validHash = /^[a-fA-F0-9]{64}$/.test(id);
    const validHeight = /^\d+$/.test(id) && Number(id) <= 100_000_000;
    if (!validHash && !validHeight) {
      return new NextResponse(proxyErrorPage('Block not found', 'Enter a valid block height or a 64-character block hash.', { href: '/blocks', label: 'Browse blocks' }), {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, follow' },
      });
    }
  }
  const governancePath = request.nextUrl.pathname;
  const chartPath = governancePath.match(/^\/charts\/([^/]+)\/?$/);
  if (chartPath && !CHART_CATALOG.some(chart => chart.id === chartPath[1])) {
    return new NextResponse(proxyErrorPage('Chart not found', 'This chart is not in the catalog.', { href: '/charts', label: 'Browse charts' }), {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, follow' },
    });
  }
  if (governancePath === '/governance' || governancePath.startsWith('/governance/')) {
    const result = await resolveGovernanceRequest(governancePath, getConfiguredNetwork() ?? 'testnet');
    if (result.status === 308) return NextResponse.redirect(new URL(result.location, request.url), 308);
    if (result.status !== 200) {
      const unavailable = result.status === 503;
      const title = unavailable ? 'Vote temporarily unavailable' : 'Vote not found';
      return new NextResponse(proxyErrorPage(title, unavailable ? 'The voting directory could not be reached. Please try again shortly.' : 'This governance page is not available.', unavailable ? { href: '/', label: 'Explorer home' } : { href: '/governance', label: 'All votes' }), { status: result.status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, follow', ...(unavailable ? { 'Retry-After': '60' } : {}) } });
    }
  }
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

  // Block pages take their CDN lifetime from ISR (getBlockResolution): one
  // hour for blocks 100+ below the tip, 30s near it. A blanket header here
  // would also pin near-tip, reorg-prone and future heights for an hour.
  return NextResponse.next();
}

export const config = {
  matcher: ['/name/:path*', '/api/:path*', '/block/:path*', '/blocks', '/governance/:path*', '/charts/:slug'],
};
