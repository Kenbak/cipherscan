/** Mainnet activation block timestamps, verified through /api/block/:height.
 * Dates are UTC calendar days, not projected upgrade dates. */

export interface ZcashMilestone {
  id: 'sprout' | 'sapling' | 'orchard' | 'ironwood';
  label: string;
  /** ISO date YYYY-MM-DD — mapped to nearest daily history point on or after this date */
  date: string;
  height: number;
}

export const ZCASH_LAUNCH_DATE = '2016-10-28';

export const ZCASH_SUPPLY_MILESTONES: ZcashMilestone[] = [
  { id: 'sprout', label: 'Sprout', date: ZCASH_LAUNCH_DATE, height: 0 },
  { id: 'sapling', label: 'Sapling', date: '2018-10-29', height: 419200 },
  { id: 'orchard', label: 'Orchard', date: '2022-05-31', height: 1687104 },
  { id: 'ironwood', label: 'Ironwood', date: '2026-07-28', height: 3428143 },
];

export function nearestHistoryIndexOnOrAfter(dates: string[], targetDate: string): number {
  const target = new Date(`${targetDate}T00:00:00Z`).getTime();
  for (let i = 0; i < dates.length; i++) {
    const t = new Date(`${dates[i].slice(0, 10)}T00:00:00Z`).getTime();
    if (t >= target) return i;
  }
  return dates.length - 1;
}

/** Position uses the same sample indices as the slider, so gaps cannot misalign markers. */
export function supplyMilestoneMarkers(dates: string[]) {
  if (dates.length < 2) return [];
  return ZCASH_SUPPLY_MILESTONES.filter(m => m.date >= dates[0].slice(0, 10) && m.date <= dates[dates.length - 1].slice(0, 10)).map(m => {
    const index = nearestHistoryIndexOnOrAfter(dates, m.date);
    return { ...m, index, percent: index / (dates.length - 1) * 100 };
  });
}
