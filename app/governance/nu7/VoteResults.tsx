import { NU7_ROUND_ID, NU7_SUMMARY_URL, NU7_TALLY_URL, NU7_VERIFY_COMMAND, ZEC_PER_VOTE_UNIT, type VoteResults as Results } from '@/lib/nu7-vote-results';

const zec = (units: number) => (units * ZEC_PER_VOTE_UNIT).toLocaleString('en-US', { maximumFractionDigits: 3 });

export function VoteResults({ results }: { results: Results }) {
  const published = results.state === 'published';
  const thresholdMet = results.proposals.some(p => p.options.reduce((s, o) => s + o.total_value, 0) * ZEC_PER_VOTE_UNIT >= 1_000_000);
  return (
    <section className="space-y-6 mb-8" aria-labelledby="results-heading">
      <div className="rounded-2xl border border-cipher-border bg-cipher-surface p-5 sm:p-6">
        <h2 id="results-heading" className="text-xl font-bold text-primary mb-2">{published ? 'Published results' : results.state === 'pending' ? 'Awaiting final results' : 'Results temporarily unavailable'}</h2>
        <p className="text-sm text-secondary">{published
          ? 'Published by the voting-chain API. CipherScan has not independently verified this tally.'
          : 'A complete finalized tally could not be confirmed. This does not mean zero votes were cast. Reload this page or check the source links below.'}</p>
        <a href="#verify-results" className="inline-block text-sm text-cipher-cyan underline mt-3">Verify this tally independently</a>
        {published && <>
          <p className="text-sm text-primary mt-3">1,000,000 ZEC participation threshold: <strong>{thresholdMet ? 'met' : 'not met'}</strong>.</p>
          <p className="text-xs text-muted mt-2">The threshold applies to at least one question, including abstentions. Each question is counted separately; totals cannot be added to count unique participating ZEC or voters.</p>
        </>}
      </div>
      {results.proposals.map(p => {
        const total = p.options.reduce((s, o) => s + o.total_value, 0);
        const highest = Math.max(...p.options.map(o => o.total_value));
        const leaders = p.options.filter(o => highest > 0 && o.total_value === highest);
        const orderedOptions = [...p.options].sort((a, b) =>
          Number(b.total_value === highest) - Number(a.total_value === highest) || a.index - b.index);
        return <article key={p.id} className="rounded-2xl border border-cipher-border bg-cipher-surface p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
            <h3 className="text-base font-bold text-primary">Q{p.id} — {p.title}</h3>
            <p className="text-xs font-mono text-muted">{zec(total)} ZEC participating</p>
          </div>
          <div className="space-y-2">{orderedOptions.map(o => {
            const percent = total ? o.total_value / total * 100 : 0;
            const leading = highest > 0 && o.total_value === highest;
            return <div key={o.index} className={leading
              ? 'rounded-xl border border-cipher-yellow/40 bg-cipher-yellow/5 p-3 sm:p-3.5'
              : 'rounded-xl border border-cipher-border-subtle px-3 py-2.5'}>
              {leading && <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-cipher-yellow mb-2">{leaders.length > 1 ? 'Tied for top choice' : 'Top choice'}</p>}
              <div className="flex flex-wrap sm:flex-nowrap justify-between items-start gap-2 sm:gap-5">
                <div className="min-w-0">
                  <p className={leading ? 'text-sm sm:text-base font-semibold text-primary leading-snug' : 'text-sm text-secondary'}>
                    <span className={leading ? 'text-cipher-yellow mr-2' : 'text-muted mr-2'}>{String.fromCharCode(65 + o.index)}.</span>{o.label}
                  </p>
                  {o.description && <p className="text-xs text-secondary mt-1 leading-relaxed">{o.description}</p>}
                </div>
                <div className="shrink-0 sm:text-right">
                  <p className={leading ? 'text-xl sm:text-2xl font-bold font-mono text-cipher-yellow tabular-nums' : 'text-sm font-mono text-secondary tabular-nums'}>{total ? `${percent.toFixed(2)}%` : '—'}</p>
                  <p className="text-xs font-mono text-muted mt-1 tabular-nums">{zec(o.total_value)} ZEC</p>
                </div>
              </div>
              <div className={`${leading ? 'h-1.5 mt-3' : 'h-1 mt-2'} rounded-full bg-glass-6 overflow-hidden`} aria-hidden="true">
                <div className={`h-full rounded-full ${leading ? 'bg-cipher-yellow' : 'bg-glass-12'}`} style={{ width: `${percent}%` }} />
              </div>
            </div>;
          })}</div>
          <details className="mt-4 text-xs text-secondary">
            <summary className="cursor-pointer text-muted">Question context</summary>
            <p className="mt-2 whitespace-pre-line leading-relaxed">{p.description}</p>
          </details>
          <p className="text-xs text-muted mt-3">Percentages use this question’s vote weight, including abstentions. They are not percentages of voters.</p>
        </article>;
      })}
      <section id="verify-results" className="rounded-2xl border border-cipher-border bg-cipher-surface p-5 sm:p-6 space-y-4" aria-labelledby="verify-heading">
        <h2 id="verify-heading" className="text-lg font-bold text-primary">Verify the results yourself</h2>
        <p className="text-sm text-secondary">Anyone can audit the published tally using a synced, independently operated zvote-1 full node. No wallet, private keys, or funds are needed.</p>
        <div><p className="text-xs text-muted mb-1">NU7 Scope round · Zcash mainnet snapshot 3,459,350</p><code className="text-xs text-primary break-all">{NU7_ROUND_ID}</code></div>
        <ol className="list-decimal pl-5 space-y-3 text-sm text-secondary">
          <li>Follow the <a className="text-cipher-cyan underline" href="https://tally.valargroup.org">official full-node setup and verification guide</a>. Confirm the chain is zvote-1 and let your node sync.</li>
          <li>Run the command below against your own node. It checks the finalized totals against encrypted accumulators and validator partial decryptions.</li>
          <li>Check that the report names this round, reports <code>SESSION_STATUS_FINALIZED</code> and <code>verified: true</code>, and includes all 19 question/option checks. Compare its <code>claimed_total</code> values with the raw tally below. A failed or missing check needs investigation.</li>
        </ol>
        <pre className="rounded-lg bg-glass-3 p-4 overflow-x-auto text-xs text-primary"><code>{NU7_VERIFY_COMMAND}</code></pre>
        <div className="flex flex-wrap gap-4 text-sm text-cipher-cyan">
          <a className="underline" href={NU7_SUMMARY_URL}>Question labels &amp; totals (JSON)</a>
          <a className="underline" href={NU7_TALLY_URL}>Raw finalized tally (JSON)</a>
          <a className="underline" href="https://github.com/valargroup/vote-sdk/blob/7c59b7cc32593ec1a596b8a007431313d7c568a5/x/vote/client/cli/query.go">Verifier source</a>
        </div>
        <p className="text-xs text-muted">Each raw tally unit is 12,500,000 zatoshi (0.125 ZEC), per the <a className="text-cipher-cyan underline" href="https://github.com/valargroup/vote-sdk/blob/7c59b7cc32593ec1a596b8a007431313d7c568a5/ui/src/App.tsx#L2958">voting software’s conversion</a>. Missing option index 0 fields in the JSON use protobuf’s zero default. API responses alone are not independent verification. The verifier checks the aggregate tally; it does not reveal individual ballots or constitute a full protocol audit.</p>
        <p className="text-xs text-muted">CipherScan checks for a complete, matching summary and tally. Source responses are cached for up to five minutes and may remain older during upstream failures; this page does not auto-refresh results.</p>
      </section>
    </section>
  );
}
