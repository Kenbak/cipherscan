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
    shielding: isDark ? '#65C79A' : '#14734B',
    deshielding: isDark ? '#E2A66E' : '#A34A16',
    shielded: isDark ? '#B6A0E0' : '#7040B5',
    netFlow: isDark ? '#B6A0E0' : '#7040B5',
    // Turnstile outcomes — held uses ZEC yellow to distinguish from transferred slate
    held: isDark ? '#F8BC21' : '#DB9E00',
    reshielded: isDark ? '#65C79A' : '#14734B',
    moved: isDark ? '#94a3b8' : '#64748b',
    transferred: isDark ? '#64748b' : '#475569',
    bridge: isDark ? '#B6A0E0' : '#7040B5',
    exchange: isDark ? '#E2A66E' : '#A34A16',
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
