export function getChartColors(theme: 'dark' | 'light') {
  const isDark = theme === 'dark';
  return {
    grid: isDark ? '#1e293b' : '#e2e8f0',
    axis: isDark ? '#64748b' : '#94a3b8',
    tooltipBg: isDark ? '#0f1419' : '#ffffff',
    tooltipBorder: isDark ? '#1e293b' : '#e2e8f0',
    tooltipText: isDark ? '#e2e8f0' : '#1e293b',
    ironwood: '#F59E0B',
    orchard: '#22c55e',
    sapling: '#56D4C8',
    sprout: '#F4B728',
    transparent: '#64748b',
    shielded: isDark ? '#A78BFA' : '#7C3AED',
    cyan: '#56D4C8',
    yellow: '#F4B728',
    purple: '#a78bfa',

    // Ironwood page — theme-aware accent colors
    denominated: isDark ? '#34d399' : '#059669',
    distinctive: isDark ? '#f97316' : '#C2410C',
    orchardPool: isDark ? '#A78BFA' : '#7C3AED',
    ironwoodPool: isDark ? '#F4B728' : '#D49B00',
    verifiedRing: isDark ? '#10b981' : '#059669',

    // Chart structural elements
    referenceLine: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)',
    cursor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
    gridStroke: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)',
    barCursor: isDark ? 'rgba(244,183,40,0.08)' : 'rgba(244,183,40,0.12)',
  };
}
