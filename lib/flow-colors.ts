/**
 * Semantic colors for shield/deshield flows and turnstile outcomes.
 * Matches ShieldFlowBadge: green = into privacy, orange = out of privacy, purple = shielded state.
 */

export type FlowTheme = 'dark' | 'light';

export interface FlowColors {
  shielding: string;
  deshielding: string;
  shielded: string;
  netFlow: string;
  held: string;
  reshielded: string;
  moved: string;
  transferred: string;
  bridge: string;
  exchange: string;
}

export function getFlowColors(theme: FlowTheme): FlowColors {
  const isDark = theme === 'dark';
  return {
    shielding: isDark ? '#00E676' : '#059669',
    deshielding: isDark ? '#FF6B35' : '#C2410C',
    shielded: isDark ? '#A78BFA' : '#7C3AED',
    netFlow: isDark ? '#A78BFA' : '#7C3AED',
    // Turnstile outcomes — held uses ZEC yellow to distinguish from transferred slate
    held: isDark ? '#F4B728' : '#D49B00',
    reshielded: isDark ? '#00E676' : '#059669',
    moved: isDark ? '#94a3b8' : '#64748b',
    transferred: isDark ? '#64748b' : '#475569',
    bridge: isDark ? '#A78BFA' : '#7C3AED',
    exchange: isDark ? '#FF6B35' : '#C2410C',
  };
}

export const TURNSTILE_CATEGORY_LABELS = {
  held: 'Still Held',
  reshielded: 'Reshielded',
  moved: 'Moved',
  transferred: 'Transferred',
  bridge: 'To Bridge',
  exchange: 'To Exchange',
} as const;
