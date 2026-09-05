import Image from 'next/image';

/** Original supplied artwork; CSS selects the correct theme before hydration. */
export function BrandLogo({ className = '', compact = false, network }: { className?: string; compact?: boolean; network?: string }) {
  if (compact) return <span className={`brand-square ${className}`} role="img" aria-label="ZecBlock" />;
  if (network) return (
    <span className={`brand-lockup ${className}`}>
      <span className="brand-lockup-square" aria-hidden="true" />
      <span className="brand-lockup-type">
        <span className="brand-wordmark" role="img" aria-label="ZecBlock">
          <Image src="/brand/zecblock-wordmark-white.png" alt="" width={450} height={73} priority className="brand-logo-dark" />
          <Image src="/brand/zecblock-wordmark-black.png" alt="" width={450} height={73} priority className="brand-logo-light" />
        </span>
        <span className="brand-network">[ {network} ]</span>
      </span>
    </span>
  );
  return (
    <span className={`brand-logo ${className}`} role="img" aria-label="ZecBlock">
      <Image src="/brand/zecblock-white.png" alt="" width={424} height={99} priority className="brand-logo-dark" />
      <Image src="/brand/zecblock-black.png" alt="" width={424} height={99} priority className="brand-logo-light" />
    </span>
  );
}
