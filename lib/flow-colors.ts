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
    shielding: isDark ? '#65C79A' : '#506F43',
    deshielding: isDark ? '#E2A66E' : '#92603D',
    shielded: isDark ? '#B6A0E0' : '#75628E',
    netFlow: isDark ? '#B6A0E0' : '#75628E',
    // Turnstile outcomes — held uses ZEC yellow to distinguish from transferred slate
    held: isDark ? '#F8BC21' : '#866008',
    reshielded: isDark ? '#65C79A' : '#506F43',
    moved: isDark ? '#94a3b8' : '#64748b',
    transferred: isDark ? '#64748b' : '#475569',
    bridge: isDark ? '#B6A0E0' : '#75628E',
    exchange: isDark ? '#E2A66E' : '#92603D',
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
