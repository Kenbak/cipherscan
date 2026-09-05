import Image from 'next/image';

/** Supplied silhouette. Light mode uses the requested gold and dark lettering. */
export function BrandLogo({ className = '', compact = false, network, tone }: { className?: string; compact?: boolean; network?: string; tone?: 'dark' | 'light' }) {
  const artwork = (
    <span className={`brand-logo ${compact ? 'brand-logo-compact' : ''} ${className}`} data-tone={tone} role="img" aria-label="ZecBlock">
      <Image src="/brand/zecblock-dot.png" alt="" width={374} height={57} priority={Boolean(network)} />
      <span className="brand-logo-ink" aria-hidden="true" />
    </span>
  );
  if (!network) return artwork;
  return <span className="brand-lockup">{artwork}<span className="brand-network">[ {network} ]</span></span>;
}
