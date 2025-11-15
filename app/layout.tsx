import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Image from "next/image";
import { GoogleAnalytics } from '@next/third-parties/google';
import { NavBar } from "@/components/NavBar";
import { DonateButton } from "@/components/DonateButton";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CipherScan - Zcash Blockchain Explorer",
  description: "Explore the Zcash blockchain with clarity. Privacy meets transparency. Fast, simple, and educational Zcash explorer for testnet and mainnet.",
  keywords: ["Zcash", "blockchain", "explorer", "cryptocurrency", "privacy", "ZEC", "CipherScan", "testnet", "mainnet", "shielded transactions"],

  // Open Graph (Facebook, LinkedIn, Discord, etc.)
  openGraph: {
    title: "CipherScan - Zcash Blockchain Explorer",
    description: "Explore the Zcash blockchain with clarity. Privacy meets transparency.",
    url: "https://testnet.cipherscan.app",
    siteName: "CipherScan",
    images: [
      {
        url: "https://testnet.cipherscan.app/og-image.png", // Absolute URL
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
    images: ["https://testnet.cipherscan.app/og-image.png"], // Absolute URL
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

  // Google Search Console Verification
  verification: {
    google: 'UZExU7CsBdY8qvEATObJg__1uXGSrLb8umTF',
  },

  // Category
  category: 'technology',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <NavBar />
        <main className="min-h-screen">{children}</main>

        {/* Google Analytics - Add your GA4 Measurement ID here */}
        <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID || ''} />
        <footer className="bg-cipher-surface/50 border-t border-cipher-border mt-12 sm:mt-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
            {/* Footer Grid - 3 columns on desktop, stack on mobile */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 items-center">

              {/* Left: Branding */}
              <div className="text-center md:text-left">
                <div className="flex items-center justify-center md:justify-start space-x-2 mb-2 sm:mb-3">
                  <Image
                    src="/logo.png"
                    alt="CipherScan Logo"
                    width={28}
                    height={28}
                    className="sm:w-8 sm:h-8"
                  />
                  <span className="font-mono text-base sm:text-xl font-bold text-cipher-cyan">CIPHERSCAN</span>
                </div>
                <p className="text-xs sm:text-sm text-gray-400 mb-1 sm:mb-2">
                  Zcash Blockchain Explorer
                </p>
                <p className="text-xs text-gray-500 font-mono">
                  Privacy • Transparency • Simplicity
                </p>
              </div>

              {/* Center: Donate Button */}
              <div className="flex items-center justify-center">
                <DonateButton />
              </div>

              {/* Right: Links & Info */}
              <div className="text-center md:text-right">
                <div className="flex flex-col space-y-1 sm:space-y-2">
                  <a
                    href="https://github.com/Kenbak/cipherscan"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs sm:text-sm text-gray-400 hover:text-cipher-cyan transition-colors font-mono"
                  >
                    GitHub →
                  </a>
                  <p className="text-xs text-gray-500 font-mono">
                    Powered by Zebrad
                  </p>
                  <p className="text-xs text-gray-500">
                    Built with ⚡️ for the community
                  </p>
                </div>
              </div>
            </div>

            {/* Bottom: Copyright */}
            <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-cipher-border/30 text-center">
              <p className="text-xs text-gray-500">
                © {new Date().getFullYear()} CipherScan. Open source blockchain explorer.
              </p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
