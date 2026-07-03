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
    sprout: '#E8C48D',
    transparent: '#64748b',
    shielded: isDark ? '#A78BFA' : '#7C3AED',
    cyan: '#56D4C8',
    yellow: '#E8C48D',
    purple: '#a78bfa',
  };
}
