import { revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-revalidate-secret');
  if (!secret || secret !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { tag?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const tag = body.tag;
  if (!tag || typeof tag !== 'string') {
    return NextResponse.json({ error: 'Missing or invalid tag' }, { status: 400 });
  }

  revalidateTag(tag, { expire: 0 });
  return NextResponse.json({ revalidated: true, tag });
}
