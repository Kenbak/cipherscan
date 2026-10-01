import { parseSafeZatoshi, sumZatoshis } from '@/lib/format-numbers';
import type { MigrationActivityData } from './types';

/** Migration view models use safe integers; v1 monetary fields can arrive as strings.
 * Invalid amounts reject the snapshot through the existing fetch error handling.
 */
export function normalizeMigrationData<T>(payload: T): T {
  function visit(value: unknown, key = ''): unknown {
    if (value == null) return value;
    if (key.endsWith('Zat') || key === 'velocityZatPerHour') return parseSafeZatoshi(value);
    if (Array.isArray(value)) return value.map(item => visit(item));
    if (typeof value === 'object') return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [name, visit(item, name)]),
    );
    return value;
  }
  return visit(payload) as T;
}

/** Hour aggregates cannot express an exact rolling cutoff: use 24 complete UTC hours. */
export function completedDayActivity(activity: MigrationActivityData | null, nowSeconds: number) {
  if (!activity || activity.granularity !== 'hour' || activity.bucketSeconds !== 3600) return null;
  const end = Math.floor(nowSeconds / 3600) * 3600;
  const buckets = activity.buckets.filter(bucket => bucket.bucketStart >= end - 86400 && bucket.bucketStart < end);
  return {
    txCount24h: buckets.reduce((sum, bucket) => sum + bucket.txCount, 0),
    volumeZat24h: sumZatoshis(buckets.map(bucket => bucket.volumeZat)),
  };
}
