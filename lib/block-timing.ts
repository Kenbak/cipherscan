/** Consensus eras supplied by the serving node; never infer activation dates. */
export type BlockSchedule = { eras: { height: number; seconds: number }[] };
export function scheduledSeconds(schedule: BlockSchedule | null, start: number, end: number): number | null {
  if (!schedule || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end >= 500000000) return null;
  const eras = schedule.eras;
  if (!Array.isArray(eras) || eras.length === 0 || eras[0]?.height !== 0 || eras.some((era, i) => !era || !Number.isSafeInteger(era.height) || !Number.isSafeInteger(era.seconds) || era.seconds <= 0 || (i > 0 && era.height <= eras[i - 1].height))) return null;
  return eras.reduce((sum, era, i) => sum + Math.max(0, Math.min(end, eras[i + 1]?.height ?? end) - Math.max(start, era.height)) * era.seconds, 0);
}
