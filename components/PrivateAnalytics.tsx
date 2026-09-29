'use client';

import { useEffect, useState } from 'react';
import { Analytics, type BeforeSendEvent } from '@vercel/analytics/next';
import { usePathname } from 'next/navigation';
import { analyticsPageUrl } from '@/lib/analytics-privacy';

function beforeSend(event: BeforeSendEvent) {
  // Re-check the actual location because the SDK also tracks client navigation.
  if (navigator.doNotTrack === '1' || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl) return null;
  if (event.type !== 'pageview' || !analyticsPageUrl(window.location.href)) return null;
  const url = analyticsPageUrl(event.url);
  return url ? { ...event, url } : null;
}

export function PrivateAnalytics() {
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    setEnabled(navigator.doNotTrack !== '1' && !(navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl);
  }, []);
  // Sensitive tools and individual address/transaction/block pages do not
  // load analytics. The callback also blocks an already-loaded SDK after SPA navigation.
  if (!enabled || !pathname || !analyticsPageUrl(`https://zecblock.com${pathname}`)) return null;
  return <Analytics beforeSend={beforeSend} />;
}
