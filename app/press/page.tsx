import type { ReactNode } from 'react';
import Link from 'next/link';
import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Press & Brand | CipherScan',
  description:
    'Download CipherScan logos, brand colors, and media copy. Press resources for journalists and brand assets for partners.',
  path: '/press',
  networks: ['mainnet'],
});

const BOILERPLATE =
  'CipherScan is a privacy-first Zcash blockchain explorer built by Atmosphere Labs. It makes shielded pool activity, supply verification, and network health visible without compromising user privacy — no viewing keys stored, no address tracking. Live at cipherscan.app.';

/** Core CipherScan brand colors — logo + wordmark */
const COLORS = [
  { name: 'Cipher Cyan', hex: '#00D4FF', role: 'Wordmark, links, primary accent' },
  { name: 'Cipher Yellow', hex: '#F4B728', role: 'Logo square, ZEC emphasis' },
] as const;

const DOWNLOADS = [
  { label: 'Wordmark (SVG)', href: '/brand/cipherscan-wordmark.svg', note: 'Mark + CIPHERSCAN — transparent background' },
  { label: 'Wordmark on dark (SVG)', href: '/brand/cipherscan-wordmark-dark-bg.svg', note: 'Mark + CIPHERSCAN on #08090F' },
  { label: 'Logo mark only (PNG)', href: '/logo.png', note: 'Icon without text' },
  { label: 'App icon 512×512', href: '/icon-512.png', note: 'Square icon for app stores & social' },
  { label: 'App icon 192×192', href: '/icon-192.png', note: 'PWA / smaller contexts' },
  { label: 'Apple touch icon', href: '/apple-touch-icon.png', note: '180×180 home-screen icon' },
  { label: 'Favicon', href: '/favicon.ico', note: 'Browser tab icon' },
] as const;

const CONTACTS = [
  {
    label: 'Website',
    value: 'cipherscan.app',
    href: 'https://cipherscan.app',
    external: true,
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.2" />
        <path d="M2 8h12M8 2.5c1.8 2 2.8 4.2 2.8 5.5S9.8 11 8 13M8 2.5C6.2 4.5 5.2 6.7 5.2 8s1 3.5 2.8 5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: 'X / Twitter',
    value: '@cipherscan_app',
    href: 'https://twitter.com/cipherscan_app',
    external: true,
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M9.2 7.1 13.1 2h-1.2l-3.3 4.4L6.4 2H2.5l4.1 5.9L2.5 14h1.2l3.5-4.7 2.2 4.7h3.9L9.2 7.1Zm-1.3 1.6-.4-.6-3.2-4.6h1.5l2.6 3.7.4.6 3.4 4.8H9.8l-2.9-4.1Z" fill="currentColor" />
      </svg>
    ),
  },
  {
    label: 'GitHub',
    value: 'Kenbak/cipherscan',
    href: 'https://github.com/Kenbak/cipherscan',
    external: true,
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M8 1.2c-3.8 0-6.8 3.1-6.8 6.9 0 3 2 5.6 4.7 6.5.3.1.5-.1.5-.4v-1.4c-1.9.4-2.3-.9-2.3-.9-.3-.8-.8-1-0.8-1-.6-.4.1-.4.1-.4.7 0 1 .7 1 .7.6 1.1 1.7.8 2.1.6.1-.5.2-.8.4-1-1.5-.2-3.1-.8-3.1-3.4 0-.8.3-1.4.7-1.9-.1-.2-.3-.9.1-1.9 0 0 .6-.2 2 .7.6-.2 1.2-.3 1.8-.3.6 0 1.2.1 1.8.3 1.4-.9 2-.7 2-.7.4 1 .2 1.7.1 1.9.4.5.7 1.1.7 1.9 0 2.6-1.6 3.2-3.1 3.4.2.2.4.6.4 1.2v1.8c0 .3.2.5.5.4 2.7-.9 4.7-3.5 4.7-6.5 0-3.8-3.1-6.9-6.8-6.9Z"
          fill="currentColor"
        />
      </svg>
    ),
  },
  {
    label: 'Built by',
    value: 'Atmosphere Labs',
    href: '/about',
    external: false,
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M3 13V5.5L8 2.5l5 3V13H3Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M6.5 13v-3.5h3V13" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    ),
  },
] as const;

function DownloadRow({ label, href, note }: { label: string; href: string; note: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-cipher-border/20 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <a
          href={href}
          download
          className="text-sm font-mono font-semibold text-cipher-cyan hover:text-primary transition-colors"
        >
          {label}
        </a>
        <p className="mt-0.5 text-[11px] text-muted">{note}</p>
      </div>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 text-[10px] font-mono uppercase tracking-wider text-muted hover:text-primary transition-colors"
      >
        Preview ↗
      </a>
    </div>
  );
}

function WordmarkPreview({ variant }: { variant: 'dark' | 'light' }) {
  const isDark = variant === 'dark';
  return (
    <div
      className={`flex min-w-[200px] flex-1 items-center gap-2.5 rounded-xl border px-5 py-4 ${
        isDark ? 'border-cipher-border/30 bg-[#08090F]' : 'border-cipher-border/20 bg-white'
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="" className="h-8 w-8 shrink-0 object-contain" width={32} height={32} />
      <span className="text-lg font-bold font-mono tracking-wider text-cipher-cyan-bright">CIPHERSCAN</span>
    </div>
  );
}

function LogoPreview({ variant }: { variant: 'dark' | 'light' }) {
  const isDark = variant === 'dark';
  return (
    <div
      className={`flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-xl border p-5 ${
        isDark ? 'border-cipher-border/30 bg-[#08090F]' : 'border-cipher-border/20 bg-white'
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt={isDark ? 'CipherScan logo on dark background' : 'CipherScan logo on light background'}
        className="max-h-full max-w-full object-contain"
        width={72}
        height={72}
      />
    </div>
  );
}

function ColorSwatch({ hex, name }: { hex: string; name: string }) {
  return (
    <span
      className="h-8 w-8 shrink-0 rounded-md border border-cipher-border/40"
      style={{ backgroundColor: hex }}
      aria-hidden
      title={name}
    />
  );
}

function ContactCard({
  label,
  value,
  href,
  external,
  icon,
}: {
  label: string;
  value: string;
  href: string;
  external: boolean;
  icon: ReactNode;
}) {
  const inner = (
    <>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cipher-cyan/10 text-cipher-cyan">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted">{label}</div>
        <div className="mt-0.5 truncate text-sm font-mono font-medium text-primary group-hover:text-primary transition-colors">
          {value}
        </div>
      </div>
    </>
  );

  const className =
    'group flex items-center gap-3 rounded-xl border border-cipher-border/25 bg-glass-3/20 px-4 py-3 transition-colors hover:border-cipher-cyan/25 hover:bg-glass-4/40';

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {inner}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {inner}
    </Link>
  );
}

export default function PressPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <header className="mb-10">
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted mb-2">Press &amp; brand</p>
        <h1 className="text-2xl sm:text-3xl font-bold font-sans text-primary">Media kit</h1>
        <p className="mt-3 text-sm leading-relaxed text-secondary">
          Official logos, colors, and boilerplate for articles, listings, and partner pages.
        </p>
      </header>

      <section className="mb-10 rounded-2xl border border-cipher-border bg-cipher-surface p-5 sm:p-6">
        <h2 className="text-sm font-bold text-primary mb-4">Logo</h2>

        <p className="mb-2 text-[10px] font-mono uppercase tracking-wider text-muted">Wordmark</p>
        <div className="mb-6 flex flex-col gap-3 sm:flex-row">
          <WordmarkPreview variant="dark" />
          <WordmarkPreview variant="light" />
        </div>

        <p className="mb-2 text-[10px] font-mono uppercase tracking-wider text-muted">Mark only</p>
        <div className="mb-5 flex flex-wrap items-center gap-4">
          <LogoPreview variant="dark" />
          <LogoPreview variant="light" />
        </div>
        <p className="mb-4 text-xs text-muted">
          Use the wordmark in headers and partner pages. Use the mark alone for favicons and small spaces.
        </p>
        {DOWNLOADS.map((d) => (
          <DownloadRow key={d.href} {...d} />
        ))}
      </section>

      <section className="mb-10 rounded-2xl border border-cipher-border bg-cipher-surface p-5 sm:p-6">
        <h2 className="text-sm font-bold text-primary mb-4">Colors</h2>
        <div className="space-y-3">
          {COLORS.map((c) => (
            <div key={c.hex} className="flex items-center gap-3">
              <ColorSwatch hex={c.hex} name={c.name} />
              <div>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-mono font-semibold text-primary">{c.name}</span>
                  <span className="text-xs font-mono text-muted">{c.hex}</span>
                </div>
                <p className="text-[11px] text-muted">{c.role}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-10 rounded-2xl border border-cipher-border bg-cipher-surface p-5 sm:p-6">
        <h2 className="text-sm font-bold text-primary mb-4">Typography</h2>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-wider text-muted">UI</dt>
            <dd className="mt-1 text-primary font-sans">Inter — headings, body, navigation</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-wider text-muted">Data &amp; labels</dt>
            <dd className="mt-1 font-mono text-primary">JetBrains Mono — hashes, stats, chart axes</dd>
          </div>
        </dl>
      </section>

      <section className="mb-10 rounded-2xl border border-cipher-border bg-cipher-surface p-5 sm:p-6">
        <h2 className="text-sm font-bold text-primary mb-2">About CipherScan</h2>
        <p className="text-xs font-mono text-muted mb-3">Copy-paste for articles, listings, and partner pages.</p>
        <blockquote className="rounded-lg border border-cipher-border/25 bg-glass-3/30 px-4 py-3 text-sm leading-relaxed text-secondary">
          {BOILERPLATE}
        </blockquote>
        <p className="mt-3 text-[11px] text-muted">
          Short tagline: <span className="text-secondary">Making Zcash accessible. For everyone.</span>
        </p>
      </section>

      <section className="rounded-2xl border border-cipher-border bg-cipher-surface p-5 sm:p-6">
        <h2 className="text-sm font-bold text-primary mb-4">Contact</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {CONTACTS.map((c) => (
            <ContactCard key={c.label} {...c} />
          ))}
        </div>
      </section>
    </div>
  );
}
