export function formatChartDate(dateStr: string) {
  const iso = dateStr.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return dateStr;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  const currentYear = new Date().getFullYear();

  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: year !== currentYear ? 'numeric' : undefined,
    timeZone: 'UTC',
  });
}

export function tooltipDate(
  payload: Array<{ payload?: Record<string, unknown> }> | undefined,
  label?: string,
): string {
  const raw = payload?.[0]?.payload?.date;
  return formatChartDate(String(raw ?? label ?? ''));
}
