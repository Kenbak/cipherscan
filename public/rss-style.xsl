<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:atom="http://www.w3.org/2005/Atom">
  <xsl:output method="html" encoding="UTF-8" indent="yes"/>
  <xsl:template match="/">
    <html>
      <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <title><xsl:value-of select="/rss/channel/title"/> — RSS Feed</title>
        <style>
          :root {
            --bg: #0a0e14;
            --surface: #111820;
            --border: #1e2a38;
            --primary: #e6edf3;
            --secondary: #8b949e;
            --muted: #555d66;
            --cyan: #00d4aa;
            --cyan-dim: rgba(0, 212, 170, 0.12);
          }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            background: var(--bg);
            color: var(--primary);
            font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
            line-height: 1.6;
            padding: 2rem 1rem;
            max-width: 720px;
            margin: 0 auto;
          }
          .banner {
            background: var(--cyan-dim);
            border: 1px solid rgba(0, 212, 170, 0.2);
            border-radius: 8px;
            padding: 1rem 1.25rem;
            margin-bottom: 2rem;
            font-size: 0.85rem;
            color: var(--cyan);
          }
          .banner strong { color: var(--primary); }
          .banner a { color: var(--cyan); text-decoration: underline; }
          h1 {
            font-size: 2rem;
            font-weight: 700;
            margin-bottom: 0.5rem;
            letter-spacing: -0.02em;
          }
          .subtitle {
            color: var(--secondary);
            font-size: 0.9rem;
            margin-bottom: 2rem;
          }
          .meta {
            font-size: 0.75rem;
            color: var(--muted);
            text-transform: uppercase;
            letter-spacing: 0.15em;
            margin-bottom: 1.5rem;
          }
          .items { display: flex; flex-direction: column; gap: 1px; }
          .item-link {
            display: block;
            text-decoration: none;
            color: inherit;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 1.25rem;
            margin-bottom: 0.75rem;
            transition: border-color 0.15s;
          }
          .item-link:hover { border-color: rgba(0, 212, 170, 0.3); }
          .item-title {
            font-size: 1rem;
            font-weight: 600;
            margin-bottom: 0.5rem;
            color: var(--primary);
          }
          .item-link:hover .item-title { color: var(--cyan); }
          .item-date {
            font-size: 0.75rem;
            color: var(--muted);
            margin-bottom: 0.5rem;
          }
          .item-desc {
            font-size: 0.85rem;
            color: var(--secondary);
            line-height: 1.5;
          }
          .footer {
            margin-top: 2rem;
            padding-top: 1rem;
            border-top: 1px solid var(--border);
            font-size: 0.75rem;
            color: var(--muted);
          }
          .footer a { color: var(--cyan); text-decoration: none; }
        </style>
      </head>
      <body>
        <div class="banner">
          This is an <strong>RSS feed</strong>. Copy the URL and paste it into your RSS reader (Feedly, NetNewsWire, Thunderbird, etc.) to subscribe. <a href="https://aboutfeeds.com" target="_blank">What is RSS?</a>
        </div>

        <div class="meta">&gt; RSS FEED</div>
        <h1><xsl:value-of select="/rss/channel/title"/></h1>
        <p class="subtitle"><xsl:value-of select="/rss/channel/description"/></p>

        <div class="items">
          <xsl:for-each select="/rss/channel/item">
            <a class="item-link">
              <xsl:attribute name="href"><xsl:value-of select="link"/></xsl:attribute>
              <div class="item-date"><xsl:value-of select="pubDate"/></div>
              <div class="item-title"><xsl:value-of select="title"/></div>
              <div class="item-desc"><xsl:value-of select="description"/></div>
            </a>
          </xsl:for-each>
        </div>

        <div class="footer">
          Published by <a href="https://cipherscan.app">CipherScan</a> — Privacy intelligence for Zcash
        </div>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
