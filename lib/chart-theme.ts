export function getChartColors(theme: 'dark' | 'light') {
  const isDark = theme === 'dark';
  return {
    grid: isDark ? '#1e293b' : '#e2e8f0',
    axis: isDark ? '#64748b' : '#94a3b8',
    tooltipBg: isDark ? '#0f1419' : '#ffffff',
    tooltipBorder: isDark ? '#1e293b' : '#e2e8f0',
    tooltipText: isDark ? '#e2e8f0' : '#1e293b',

    // Pool colors — semantic system (distinct hues for scanability)
    ironwood: isDark ? '#F4B728' : '#D49B00',
    orchard: isDark ? '#A78BFA' : '#7C3AED',
    sapling: isDark ? '#56D4C8' : '#0d9488',
    sprout: isDark ? '#64748b' : '#475569',
    transparent: isDark ? '#94a3b8' : '#64748b',
    shielded: isDark ? '#A78BFA' : '#7C3AED',
    coinbase: isDark ? '#94a3b8' : '#64748b',
    cyan: '#56D4C8',
    yellow: isDark ? '#F4B728' : '#D49B00',
    purple: isDark ? '#A78BFA' : '#7C3AED',

    // Ironwood page — hero accent = gold, everything else defers
    orchardPool: isDark ? '#A78BFA' : '#7C3AED',
    ironwoodPool: isDark ? '#F4B728' : '#D49B00',
    verifiedRing: isDark ? '#10b981' : '#059669',

    // Scatter chart — gold = standard denomination, red = distinctive amount
    denominated: isDark ? '#F4B728' : '#D49B00',
    distinctive: isDark ? '#f87171' : '#dc2626',

    // Inflow bar segments — gold at varying opacity
    inflowOrchard: isDark ? 'rgba(244,183,40,1)' : 'rgba(180,130,0,1)',
    inflowTransparent: isDark ? 'rgba(244,183,40,0.65)' : 'rgba(180,130,0,0.65)',
    inflowSapling: isDark ? 'rgba(244,183,40,0.4)' : 'rgba(180,130,0,0.4)',
    inflowCoinbase: isDark ? 'rgba(244,183,40,0.2)' : 'rgba(180,130,0,0.2)',

    // Chart structural elements
    referenceLine: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)',
    cursor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
    gridStroke: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)',
    /** Ironwood / gold-accent bar charts */
    barCursor: isDark ? 'rgba(244,183,40,0.08)' : 'rgba(244,183,40,0.12)',
    /** Privacy / cyan-accent bar charts */
    barCursorCyan: isDark ? 'rgba(86, 212, 200, 0.08)' : 'rgba(13, 148, 136, 0.1)',
  };
}
