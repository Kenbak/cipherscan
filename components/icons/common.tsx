/** Small, generic icons shared across pages that aren't specific to shielded/tx-flow iconography (see icons/shield-flow.tsx for those). */

export function NetworkIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" strokeWidth={1.5} />
      <path strokeLinecap="round" strokeWidth={1.5} d="M3 12h18M12 3c2.5 2.7 3.75 6 3.75 9s-1.25 6.3-3.75 9c-2.5-2.7-3.75-6-3.75-9S9.5 5.7 12 3z" />
    </svg>
  );
}
