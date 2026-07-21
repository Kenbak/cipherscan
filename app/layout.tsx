import type { Metadata } from "next";
import localFont from "next/font/local";
import { NavBar } from "@/components/NavBar";
import { StatsBar } from "@/components/StatsBar";
import { Footer } from "@/components/Footer";
import { MaintenanceBanner } from "@/components/MaintenanceBanner";
import { ChainSyncBanner } from "@/components/ChainSyncBanner";
import { ThemeProvider } from "@/contexts/ThemeContext";
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
      title: 'CipherScan: Zcash Block Explorer & Privacy Analytics',
      description: 'CipherScan is a Zcash block explorer for searching blocks, transactions, and addresses, with live shielded pool, privacy, and network analytics.',
      keywords: ['zcash block explorer', 'zcash explorer', 'ZEC explorer', 'zcash blockchain explorer', 'zcash transactions', 'zcash shielded pool', 'privacy', 'ZEC', 'CipherScan', 'zcash rich list', 'zcash network'],
      imageAlt: 'CipherScan - Zcash Block Explorer',
    }
  : network === 'testnet'
    ? {
        title: 'CipherScan Testnet - Zcash Testnet Explorer for TAZ',
        description: 'Explore the Zcash testnet with CipherScan. Search TAZ blocks, transactions, and addresses, monitor pending transactions, and inspect testnet network activity.',
        keywords: ['zcash testnet', 'TAZ', 'TAZ explorer', 'zcash testnet explorer', 'zcash testnet transactions', 'CipherScan testnet'],
        imageAlt: 'CipherScan - Zcash Testnet Explorer for TAZ',
      }
    : {
        title: 'CipherScan Crosslink - Zcash Crosslink Explorer',
        description: 'Explore the Zcash Crosslink feature network, including blocks, finality, staking, and validators.',
        keywords: ['zcash crosslink', 'crosslink explorer', 'zcash finality', 'cTAZ'],
        imageAlt: 'CipherScan - Zcash Crosslink Explorer',
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
  publisher: "CipherScan",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
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
  ? ['CipherScan Zcash Explorer', 'cipherscan.app']
  : network === 'testnet'
    ? ['CipherScan Testnet', 'Zcash Testnet Explorer', 'TAZ Explorer']
    : ['CipherScan Crosslink', 'Zcash Crosslink Explorer'];

const siteJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${baseUrl}/#website`,
      name: 'CipherScan',
      alternateName: websiteAlternateNames,
      description: siteCopy.description,
      url: `${baseUrl}/`,
      publisher: { '@id': 'https://cipherscan.app/#organization' },
    },
    {
      '@type': 'Organization',
      '@id': 'https://cipherscan.app/#organization',
      name: 'CipherScan',
      url: 'https://cipherscan.app',
      logo: 'https://cipherscan.app/apple-touch-icon.png',
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd) }}
      />
      <MaintenanceBanner />
      <ChainSyncBanner />
      <NavBar />
      <StatsBar />
      <main className="min-h-screen">{children}</main>
      <Footer />
    </>
  );
}

// Script to prevent flash of wrong theme
const themeScript = `
  (function() {
    try {
      var theme = localStorage.getItem('theme');
      if (!theme) {
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
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <ThemeProvider>
          <AppContent>{children}</AppContent>
        </ThemeProvider>
      </body>
    </html>
  );
}
