/** Mainnet protocol milestones for supply timeline scrubbers. Dates are UTC calendar days. */

export interface ZcashMilestone {
  id: string;
  label: string;
  /** ISO date YYYY-MM-DD — mapped to nearest daily history point on or after this date */
  date: string;
  color: string;
}

export const ZCASH_LAUNCH_DATE = '2016-10-28';

export const ZCASH_SUPPLY_MILESTONES: ZcashMilestone[] = [
  { id: 'sprout', label: 'Sprout', date: ZCASH_LAUNCH_DATE, color: '#64748b' },
  { id: 'sapling', label: 'Sapling', date: '2018-12-18', color: '#56D4C8' },
  { id: 'orchard', label: 'Orchard', date: '2022-05-31', color: '#A78BFA' },
  { id: 'ironwood', label: 'Ironwood', date: '2026-07-28', color: '#F4B728' },
];

export function milestonePositionPct(
  milestoneDate: string,
  rangeStart: string,
  rangeEnd: string,
): number {
  const start = new Date(`${rangeStart}T00:00:00Z`).getTime();
  const end = new Date(`${rangeEnd}T00:00:00Z`).getTime();
  const at = new Date(`${milestoneDate}T00:00:00Z`).getTime();
  if (end <= start) return 0;
  if (at <= start) return 0;
  if (at >= end) return 100;
  return ((at - start) / (end - start)) * 100;
}

export function nearestHistoryIndexOnOrAfter(dates: string[], targetDate: string): number {
  const target = new Date(`${targetDate}T00:00:00Z`).getTime();
  for (let i = 0; i < dates.length; i++) {
    const t = new Date(`${dates[i].slice(0, 10)}T00:00:00Z`).getTime();
    if (t >= target) return i;
  }
  return dates.length - 1;
}
