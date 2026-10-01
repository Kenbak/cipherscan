/** Presentation calculations only. Daily model estimates and current quotes remain separate. */
export interface ValuationSnapshot {
  date: string;
  priceUsd: number | null;
  realizedPrice: number | null;
  mvrv: number | null;
  sopr: number | null;
  soprSource?: 'transparent_spends' | 'unavailable';
  shieldedCostBasisRatio?: number | null;
  nupl: number | null;
  marketCapUsd: number | null;
  realizedCapUsd: number | null;
  transparentRealizedCapUsd: number | null;
  shieldedRealizedCapUsd: number | null;
}
export type ValuationPoint = Omit<ValuationSnapshot, 'transparentRealizedCapUsd' | 'shieldedRealizedCapUsd'>;
export interface PriceQuote { price: number | null; change24h: number | null; timestamp: number; sourceUpdatedAt?: number | null; marketCapUsd?: number | null; volume24hUsd?: number | null }
export const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
export const positive = (value: unknown): value is number => finite(value) && value > 0;
export function utcDay(value: string): number { return Date.parse(`${value.slice(0, 10)}T00:00:00Z`); }
export function quoteIsFresh(quote: PriceQuote | null, now: number): boolean {
  if (quote?.sourceUpdatedAt === null) return false;
  if (quote?.sourceUpdatedAt !== undefined && (!finite(quote.sourceUpdatedAt) || now < quote.sourceUpdatedAt || now - quote.sourceUpdatedAt > 5 * 60_000)) return false;
  return !!quote && positive(quote.price) && finite(quote.timestamp) && now >= quote.timestamp && now - quote.timestamp <= 5 * 60_000;
}
export function snapshotIsRecent(date: string | undefined, now: number): boolean {
  if (!date) return false;
  const age = now - utcDay(date);
  return age >= 0 && age <= 3 * 86400_000;
}
/** Collapse duplicate dates and reject gaps: a 200-day average must contain 200 consecutive daily prices. */
export function dailyMarketContext(points: ValuationPoint[]) {
  const prices = [...points].filter(p => positive(p.priceUsd) && Number.isFinite(utcDay(p.date))).sort((a,b) => utcDay(a.date) - utcDay(b.date));
  const last = prices.at(-1);
  const at = new Map(prices.map(p => [utcDay(p.date), p.priceUsd!]));
  const end = last ? utcDay(last.date) : NaN;
  const window = (days: number) => Array.from({length: days}, (_, i) => at.get(end - i * 86400_000));
  const average = (days: number) => { const values = window(days); return values.every(positive) ? values.reduce((sum,n) => sum + n!, 0) / days : null; };
  const change = (days: number) => { const previous = at.get(end - days * 86400_000); return positive(previous) && last ? (last.priceUsd! / previous - 1) * 100 : null; };
  const annual = window(365);
  return { date: last?.date ?? null, price: last?.priceUsd ?? null, ma200: average(200), change30d: change(30), change90d: change(90), high365: annual.every(positive) ? Math.max(...annual as number[]) : null };
}
export function modeledPremium(snapshot: ValuationSnapshot | null, quote: PriceQuote | null, now: number): number | null {
  if (!snapshot || !positive(snapshot.realizedPrice) || !snapshotIsRecent(snapshot.date, now) || !quoteIsFresh(quote, now)) return null;
  return quote!.price! / snapshot.realizedPrice;
}
