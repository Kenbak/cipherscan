import type { Metadata } from "next";
import localFont from "next/font/local";
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";
import { MaintenanceBanner } from "@/components/MaintenanceBanner";
import { ChainSyncBanner } from "@/components/ChainSyncBanner";
import { ThemeProvider } from "@/contexts/ThemeContext";
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

export const metadata: Metadata = {
  metadataBase: new URL('https://cipherscan.app'),
  title: "CipherScan - Zcash Block Explorer & Privacy Analytics",
  description: "Zcash block explorer with privacy analytics. Search blocks, transactions, and addresses. Track shielded pool stats, privacy scores, and network health. Open-source and privacy-first.",
  keywords: ["zcash block explorer", "zcash explorer", "ZEC explorer", "zcash blockchain explorer", "zcash transactions", "zcash shielded pool", "privacy", "ZEC", "CipherScan", "zcash rich list", "zcash network"],

  openGraph: {
    title: "CipherScan - Zcash Block Explorer",
    description: "Zcash block explorer with privacy analytics. Search blocks, transactions, addresses, and shielded pool activity.",
    url: "https://cipherscan.app",
    siteName: "CipherScan",
    images: [
      {
        url: "/og-image.png?v=2",
        width: 1200,
        height: 630,
        alt: "CipherScan - Zcash Block Explorer",
      },
    ],
    locale: "en_US",
    type: "website",
  },

  twitter: {
    card: "summary_large_image",
    title: "CipherScan - Zcash Block Explorer",
    description: "Zcash block explorer with privacy analytics. Search blocks, transactions, addresses, and shielded pool activity.",
    images: ["/og-image.png?v=2"],
    creator: "@Kenbak",
  },

  // Additional meta
  authors: [{ name: "Kenbak" }],
  creator: "Kenbak",
  publisher: "CipherScan",

  // Robots configuration
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },

  // Icons
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },

  // Manifest for PWA
  manifest: "/manifest.json",

  // Canonical + RSS
  // './' resolves to the current pathname (via metadataBase), so every page
  // gets a self-referencing canonical unless it overrides alternates itself.
  // A hardcoded absolute URL here would mark every page as a duplicate of
  // the homepage and block indexing.
  alternates: {
    canonical: './',
    types: {
      'application/rss+xml': 'https://cipherscan.app/newsletter/rss',
    },
  },

  // Category
  category: 'technology',
};

// Site-wide JSON-LD structured data.
// WebSite.name + alternateName teach Google the site-name entity for the
// "cipherscan" brand query; Organization with sameAs links the domain to
// our social/code profiles for entity disambiguation.
const siteJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': 'https://cipherscan.app/#website',
      name: 'CipherScan',
      alternateName: ['CipherScan Zcash Explorer', 'cipherscan.app'],
      description: 'Zcash block explorer and privacy analytics platform. Explore blocks, transactions, addresses, and shielded pool activity.',
      url: 'https://cipherscan.app',
      publisher: { '@id': 'https://cipherscan.app/#organization' },
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: 'https://cipherscan.app/tx/{search_term_string}',
        },
        'query-input': 'required name=search_term_string',
      },
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
