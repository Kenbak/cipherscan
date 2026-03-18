import { getAllNewsletters } from '@/lib/newsletter';
import { NextResponse } from 'next/server';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function GET() {
  const newsletters = getAllNewsletters();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://cipherscan.app';

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>CipherScan Weekly</title>
    <description>Weekly Zcash intelligence — protocol updates, network stats, and privacy insights. No tracking.</description>
    <link>${siteUrl}/newsletter</link>
    <atom:link href="${siteUrl}/newsletter/rss" rel="self" type="application/rss+xml"/>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <docs>https://www.rssboard.org/rss-specification</docs>
    <generator>CipherScan</generator>${newsletters
      .map(
        (n) => `
    <item>
      <title>${escapeXml(n.title)}</title>
      <description>${escapeXml(n.summary)}</description>
      <link>${siteUrl}/newsletter/${n.slug}</link>
      <guid isPermaLink="true">${siteUrl}/newsletter/${n.slug}</guid>
      <pubDate>${new Date(n.date).toUTCString()}</pubDate>
    </item>`
      )
      .join('')}
  </channel>
</rss>`;

  return new NextResponse(rss, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
