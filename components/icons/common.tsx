/** Small, generic icons shared across pages that aren't specific to shielded/tx-flow iconography (see icons/shield-flow.tsx for those). */

export function NetworkIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" strokeWidth={1.5} />
      <path strokeLinecap="round" strokeWidth={1.5} d="M3 12h18M12 3c2.5 2.7 3.75 6 3.75 9s-1.25 6.3-3.75 9c-2.5-2.7-3.75-6-3.75-9S9.5 5.7 12 3z" />
    </svg>
  );
}

/** "Customize" affordance — mixer/sliders, distinct from a gear (which usually implies app-wide settings, not "swap this one card's content"). */
export function SlidersIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h10m4 0h2M4 12h2m4 0h10M4 18h14m4 0h2" />
      <circle cx="16" cy="6" r="2" strokeWidth={1.5} />
      <circle cx="8" cy="12" r="2" strokeWidth={1.5} />
      <circle cx="20" cy="18" r="2" strokeWidth={1.5} />
    </svg>
  );
}
