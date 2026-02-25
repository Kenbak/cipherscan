import type { Metadata } from "next";
import localFont from "next/font/local";
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";
import { MaintenanceBanner } from "@/components/MaintenanceBanner";
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
  title: "CipherScan - Zcash Blockchain Explorer",
  description: "Explore the Zcash blockchain with clarity. Privacy meets transparency. Fast, simple, and educational Zcash explorer for testnet and mainnet.",
  keywords: ["Zcash", "blockchain", "explorer", "cryptocurrency", "privacy", "ZEC", "CipherScan", "testnet", "mainnet", "shielded transactions"],

  // Open Graph (Facebook, LinkedIn, Discord, etc.)
  openGraph: {
    title: "CipherScan - Zcash Blockchain Explorer",
    description: "Explore the Zcash blockchain with clarity. Privacy meets transparency.",
    url: "https://cipherscan.app",
    siteName: "CipherScan",
    images: [
      {
        url: "https://cipherscan.app/og-image.png?v=2",
        width: 1200,
        height: 630,
        alt: "CipherScan - Zcash Blockchain Explorer",
      },
    ],
    locale: "en_US",
    type: "website",
  },

  // Twitter Card
  twitter: {
    card: "summary_large_image",
    title: "CipherScan - Zcash Blockchain Explorer",
    description: "Explore the Zcash blockchain with clarity. Privacy meets transparency.",
    images: ["https://cipherscan.app/og-image.png?v=2"],
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

  // Category
  category: 'technology',
};

// Site-wide JSON-LD structured data
const siteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'CipherScan',
  description: 'Zcash blockchain explorer and privacy intelligence platform. Explore blocks, transactions, addresses, and decrypt shielded memos.',
  url: 'https://cipherscan.app',
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: 'https://cipherscan.app/tx/{search_term_string}',
    },
    'query-input': 'required name=search_term_string',
  },
  creator: {
    '@type': 'Organization',
    name: 'CipherScan',
    url: 'https://cipherscan.app',
  },
};

function AppContent({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd) }}
      />
      <MaintenanceBanner />
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
