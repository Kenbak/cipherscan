'use client';

import { useState } from 'react';

// Toggle this to show/hide the maintenance banner
const MAINTENANCE_MODE = false;
const MAINTENANCE_MESSAGE = "🔧 Database maintenance in progress. Indexing may be temporarily inaccurate. Back to normal within 24h.";

export function MaintenanceBanner() {
  const [dismissed, setDismissed] = useState(false);

  if (!MAINTENANCE_MODE || dismissed) return null;

  return (
    <div className="bg-cipher-orange/90 text-black px-4 py-2 text-center text-sm font-medium relative">
      <span>{MAINTENANCE_MESSAGE}</span>
      <button
        onClick={() => setDismissed(true)}
        className="absolute right-4 top-1/2 -translate-y-1/2 hover:text-amber-900 transition-colors"
        aria-label="Dismiss"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
