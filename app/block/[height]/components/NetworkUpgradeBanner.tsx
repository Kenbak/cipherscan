import Link from 'next/link';
import { NETWORK_UPGRADES } from '@/lib/config';
import { Badge } from '@/components/ui/Badge';
import type { BlockData } from './types';

export function NetworkUpgradeBanner({ data }: { data: BlockData }) {
  const upgrade = NETWORK_UPGRADES[data.height];
  if (!upgrade) return null;

  const badgeLabel = upgrade.badge || 'ACTIVATED';
  const linkLabel = upgrade.linkText || 'View migration tracker →';

  return (
    <div className="mb-6 rounded-xl border border-cipher-yellow-bright/30 bg-gradient-to-r from-cipher-yellow-bright/5 to-transparent p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-cipher-yellow-bright/10 border border-cipher-yellow-bright/20">
            <svg className="w-4 h-4 text-cipher-yellow-bright" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-sm font-bold text-cipher-yellow-bright">{upgrade.name}</span>
            {upgrade.zip && <Badge color="amber">{upgrade.zip}</Badge>}
            <Badge color="green">{badgeLabel}</Badge>
          </div>
          <p className="text-xs sm:text-sm text-secondary leading-relaxed">
            {upgrade.description}
          </p>
          {upgrade.link && (
            <Link
              href={upgrade.link}
              className="inline-flex items-center gap-1.5 mt-3 text-xs font-mono text-cipher-yellow-bright hover:text-cipher-yellow-glow transition-colors"
            >
              {linkLabel}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
