import type { Metadata } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { NavBar } from "@/components/NavBar";
import { StatsBar } from "@/components/StatsBar";
import { Footer } from "@/components/Footer";
import { MaintenanceBanner } from "@/components/MaintenanceBanner";
import { ChainSyncBanner } from "@/components/ChainSyncBanner";
import { NU7VoteBanner } from "@/components/NU7VoteBanner";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { WebSocketProvider } from "@/contexts/WebSocketContext";
import { buildPageMetadata, getBaseUrl, getNetwork } from "@/lib/seo";
import "./globals.css";

const geistSans = localFont({
  src: "../node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2",
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = localFont({
  src: "../node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2",
  variable: "--font-geist-mono",
  display: "swap",
});

const network = getNetwork();
const baseUrl = getBaseUrl();

const siteCopy = network === 'mainnet'
  ? {
      title: 'Zcash Block Explorer & Privacy Analytics | ZecBlock',
      description: 'ZecBlock is a Zcash block explorer for searching blocks, transactions, and addresses, with live shielded pool, privacy, and network analytics.',
      keywords: ['zcash block explorer', 'zcash explorer', 'ZEC explorer', 'zcash blockchain explorer', 'zcash transactions', 'zcash shielded pool', 'privacy', 'ZEC', 'ZecBlock', 'zcash rich list', 'zcash network'],
      imageAlt: 'ZecBlock - Zcash Block Explorer',
    }
  : network === 'testnet'
    ? {
        title: 'ZecBlock Testnet - Zcash Testnet Explorer for TAZ',
        description: 'Explore the Zcash testnet with ZecBlock. Search TAZ blocks, transactions, and addresses, monitor pending transactions, and inspect testnet network activity.',
        keywords: ['zcash testnet', 'TAZ', 'TAZ explorer', 'zcash testnet explorer', 'zcash testnet transactions', 'ZecBlock testnet'],
        imageAlt: 'ZecBlock - Zcash Testnet Explorer for TAZ',
      }
    : {
        title: 'ZecBlock Crosslink - Zcash Crosslink Explorer',
        description: 'Explore the Zcash Crosslink feature network, including blocks, finality, staking, and validators.',
        keywords: ['zcash crosslink', 'crosslink explorer', 'zcash finality', 'cTAZ'],
        imageAlt: 'ZecBlock - Zcash Crosslink Explorer',
      };

const rootPageMetadata = buildPageMetadata({
  ...siteCopy,
  path: '/',
  indexOnTestnet: true,
});

export const metadata: Metadata = {
  ...rootPageMetadata,
  authors: [{ name: "Kenbak" }],
  creator: "Kenbak",
  publisher: "ZecBlock",
  icons: {
    icon: "/brand/zecblock-mark.svg",
    shortcut: "/brand/zecblock-mark.svg",
    apple: "/apple-icon",
  },
  manifest: "/manifest.json",
  alternates: {
    canonical: `${baseUrl}/`,
    types: {
      'application/rss+xml': `${baseUrl}/newsletter/rss`,
    },
  },
  category: 'technology',
};

// Site-wide JSON-LD structured data.
// WebSite.name + alternateName teach Google the site-name entity for the
// "cipherscan" brand query; Organization with sameAs links the domain to
// our social/code profiles for entity disambiguation.
const websiteAlternateNames = network === 'mainnet'
  ? ['ZecBlock Zcash Explorer', 'zecblock.com']
  : network === 'testnet'
    ? ['ZecBlock Testnet', 'Zcash Testnet Explorer', 'TAZ Explorer']
    : ['ZecBlock Crosslink', 'Zcash Crosslink Explorer'];

const siteJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${baseUrl}/#website`,
      name: 'ZecBlock',
      alternateName: websiteAlternateNames,
      description: siteCopy.description,
      url: `${baseUrl}/`,
      publisher: { '@id': 'https://zecblock.com/#organization' },
    },
    {
      '@type': 'Organization',
      '@id': 'https://zecblock.com/#organization',
      name: 'ZecBlock',
      url: 'https://zecblock.com',
      logo: 'https://zecblock.com/brand/zecblock-mark.svg',
      sameAs: [
        'https://twitter.com/cipherscan_app',
        'https://github.com/Kenbak/cipherscan',
      ],
    },
  ],
};

function AppContent({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-cipher-surface focus:px-4 focus:py-2 focus:text-primary focus:shadow-lg"
      >
        Skip to main content
      </a>
      <MaintenanceBanner />
      <ChainSyncBanner />
      <NavBar />
      <StatsBar />
      <NU7VoteBanner />
      <main id="main-content" tabIndex={-1} className="min-h-screen">{children}</main>
      <Footer />
    </>
  );
}

// Script to prevent flash of wrong theme
const themeScript = `
  (function() {
    try {
      var theme = localStorage.getItem('theme');
      var userChose = localStorage.getItem('theme-user-set');
      if (!theme || !userChose) {
        theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
      }
      document.documentElement.classList.remove('light', 'dark');
      document.documentElement.classList.add(theme);
    } catch (e) {}
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Supports sitemap-detection tools; robots.txt remains the standards-based declaration. */}
        <link rel="sitemap" type="application/xml" href="/sitemap.xml" />
        {/*
          Site-wide structured data. This lives here, in the server-rendered
          <head>, rather than inside AppContent: AppContent sits under
          ThemeProvider/WebSocketProvider, so it is part of a client subtree,
          and React 19 hoists a <script> rendered by a component out of its
          position. The server emitted it in <body> while the client hoisted
          it, and that divergence was the hydration mismatch reported against
          the element immediately after it (the skip link). Rendering it from
          the server-only layout keeps it in the initial HTML for crawlers,
          which is the whole point of using a plain <script> for JSON-LD.
        */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd) }}
        />
        {/*
          next/script's beforeInteractive strategy is Next's own documented
          mechanism for exactly this case (must run before hydration/paint
          to avoid a flash of the wrong theme). It's injected outside the
          normal React child-render path, which avoids React 19's "script
          tag inside a component" warning that a plain <script> here would
          trigger. JSON-LD scripts below stay as plain <script> tags on
          purpose — that's the separate Next-recommended pattern for
          structured data, needed to keep it in the initial server HTML for
          crawlers (next/script's strategies inject client-side instead).
        */}
        <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <ThemeProvider>
          <WebSocketProvider>
            <AppContent>{children}</AppContent>
          </WebSocketProvider>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
