/** Counts for the transactions actually loaded, never an estimate of unseen rows. */
export function summarizeMempool(transactions: readonly { type: 'transparent' | 'mixed' | 'shielded' }[]) {
  const counts = { transparent: 0, mixed: 0, shielded: 0 };
  for (const tx of transactions) counts[tx.type] += 1;
  return {
    ...counts,
    shown: transactions.length,
    // Pool participation is not a privacy-quality score.
    shieldedShare: transactions.length > 0
      ? Math.round((counts.shielded + counts.mixed) / transactions.length * 100)
      : null,
  };
}
