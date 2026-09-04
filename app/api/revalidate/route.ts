import { revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';

// Only tags that are actually wired to tag-based revalidation elsewhere in
// this codebase: 'chain-tip' (app/page.tsx, app/blocks/page.tsx,
// app/txs/render.tsx — invalidated on-demand by server.js on every new
// block) and 'sitemap-zns-registrations' (app/sitemaps/[slug]/route.ts,
// currently only time-based via unstable_cache, but a legitimate tag this
// app maintains). Restricting to a known allow-list means a leaked or
// misused secret can only invalidate caches this app actually owns, never
// an arbitrary tag namespace.
const ALLOWED_REVALIDATION_TAGS = new Set(['chain-tip', 'sitemap-zns-registrations']);

// Constant-time comparison via fixed-length SHA-256 digests, so neither the
// secret's length nor its content leaks through response timing. Mirrors
// service-auth.js's constantTimeEqual on the API side.
function constantTimeEqual(a: string, b: string): boolean {
  const hashA = createHash('sha256').update(a).digest();
  const hashB = createHash('sha256').update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-revalidate-secret');
  const expected = process.env.REVALIDATE_SECRET;
  // Fails closed (as before) when REVALIDATE_SECRET isn't configured, and
  // never reaches the timing-unsafe `!==` comparison the previous
  // implementation used.
  if (!secret || !expected || !constantTimeEqual(secret, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { tag?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const tag = body.tag;
  if (!tag || typeof tag !== 'string' || !ALLOWED_REVALIDATION_TAGS.has(tag)) {
    return NextResponse.json({ error: 'Missing or invalid tag' }, { status: 400 });
  }

  revalidateTag(tag, { expire: 0 });
  return NextResponse.json({ revalidated: true, tag });
}
