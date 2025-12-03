import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Image from "next/image";
import { NavBar } from "@/components/NavBar";
import { DonateButton } from "@/components/DonateButton";
import { SyncBanner } from "@/components/SyncBanner";
import { isMainnet } from "@/lib/config";
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
    url: "https://cipherscan.app",
    siteName: "CipherScan",
    images: [
      {
        url: "https://cipherscan.app/og-image.png", // Absolute URL
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
    images: ["https://cipherscan.app/og-image.png"], // Absolute URL
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <NavBar />
        {isMainnet && <SyncBanner />}
        <main className="min-h-screen">{children}</main>

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
                <div className="flex flex-col space-y-3 sm:space-y-4">
                  {/* Social Links */}
                  <div className="flex items-center justify-center md:justify-end gap-4">
                    <a
                      href="https://twitter.com/cipherscan_app"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-400 hover:text-cipher-cyan transition-colors"
                      aria-label="Twitter"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                    </a>
                    <a
                      href="https://github.com/Kenbak/cipherscan"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-400 hover:text-cipher-cyan transition-colors"
                      aria-label="GitHub"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                      </svg>
                    </a>
                  </div>

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
