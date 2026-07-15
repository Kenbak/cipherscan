const COINBASE_CLIENT_MARKERS = [
  { hex: 'f09f8cb8', emoji: '🌸' },
  { hex: 'f09fa693', emoji: '🦓' },
] as const;

export type CoinbaseClientEmoji = (typeof COINBASE_CLIENT_MARKERS)[number]['emoji'];

/**
 * Returns a known client marker embedded in the raw coinbase input.
 * Coinbase markers are self-reported and are not authenticated.
 */
export function getCoinbaseClientEmoji(
  coinbaseHex?: string | null,
): CoinbaseClientEmoji | null {
  if (
    !coinbaseHex
    || coinbaseHex.length % 2 !== 0
    || !/^[0-9a-f]+$/i.test(coinbaseHex)
  ) {
    return null;
  }

  const normalizedHex = coinbaseHex.toLowerCase();
  return COINBASE_CLIENT_MARKERS.find(({ hex }) => normalizedHex.includes(hex))?.emoji ?? null;
}
