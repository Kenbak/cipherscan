'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { analysisSchema, resolveShortcut, starters, type AnalysisSpec } from '@/lib/ask/contract';
import { fetchEvidence, formatValue, summarizeEvidence, type Evidence } from '@/lib/ask/evidence';
import { getApiUrl } from '@/lib/api-config';
import { readApiResponse } from '@/lib/api-client';
import { useTheme } from '@/contexts/ThemeContext';
import { getChartColors } from '@/lib/chart-theme';
import styles from './ask.module.css';
import { AskInsights, explanationRecipe } from './AskInsights';
import { describeMetric, formatChain } from '@/lib/ask/data';

const AskChart = dynamic(() => import('./AskChart'), { ssr: false, loading: () => <div className="h-80 grid place-items-center text-sm text-muted" role="status">Loading chart…</div> });
const categories = ['Featured', 'Pools', 'Ironwood', 'Cross-chain', 'Network'];
type Message = { id: number; question: string; answer: string; spec?: AnalysisSpec };
type Session = { id: number; title: string; messages: Message[]; spec: AnalysisSpec | null };
type Capability = { mode: 'guided' | 'ai'; provider: string | null };
const initialSession: Session = { id: 0, title: 'New analysis', messages: [], spec: null };
const viewKey = (spec: AnalysisSpec | null) => spec ? JSON.stringify([spec.metric, spec.period, spec.pool, spec.view, spec.start, spec.end]) : '';

function AskMark({ small = false }: { small?: boolean }) {
  return <span className={`inline-flex shrink-0 items-center justify-center border border-cipher-border bg-cipher-surface text-cipher-gold font-mono ${small ? 'h-7 w-7 text-sm rounded' : 'h-12 w-12 text-xl rounded-lg'}`} aria-hidden="true">&gt;_</span>;
}

export function AskWorkspace() {
  const [sessions, setSessions] = useState<Session[]>([initialSession]);
  const [activeId, setActiveId] = useState(0);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [capability, setCapability] = useState<Capability>({ mode: 'guided', provider: null });
  const [fetchedEvidence, setEvidence] = useState<Evidence | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState('');
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [tablePage, setTablePage] = useState(0);
  const [exampleCategory, setExampleCategory] = useState('Featured');
  const request = useRef<AbortController | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const serial = useRef(0);
  const transcript = useRef<HTMLDivElement>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const autoExplain = useRef<string | null>(null);
  const session = sessions.find(item => item.id === activeId)!;
  const spec = session.spec;
  const info = spec ? describeMetric(spec.metric) : null;
  const ranking = Boolean(spec?.metric.startsWith('chain_'));
  const poolMetric = !spec || ['balances', 'flows', 'activity'].includes(spec.metric);
  const examples = starters.filter(starter => exampleCategory === 'Featured' ? ['balances', 'ironwood-balance', 'swap-volume', 'pulse'].includes(starter.id) : exampleCategory === 'Pools' ? ['balances', 'compare', 'flows', 'activity'].includes(starter.id) : starter.category === exampleCategory);
  const evidence = spec && fetchedEvidence?.key === `${spec.metric}:${spec.period}:${spec.pool}` ? fetchedEvidence : null;
  const start = spec?.start || '';
  const end = spec?.end || '';
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const hasMessages = session.messages.length > 0;
  const summary = evidence && spec ? summarizeEvidence(evidence, spec, start, end) : null;
  const invalidDates = Boolean(start && end && start > end);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${getApiUrl()}/v1/ask`, { signal: controller.signal, cache: 'no-store' }).then(res => readApiResponse<Capability>(res)).then(({ data, meta }) => {
      if (meta.network === 'mainnet' && ['guided', 'ai'].includes(data.mode)) setCapability(data);
    }).catch(() => {});
    return () => { controller.abort(); request.current?.abort(); };
  }, []);

  const metric = spec?.metric;
  const period = spec?.period;
  const pool = spec?.pool;
  useEffect(() => {
    setEvidence(null); setError(''); setTablePage(0);
    if (!metric || !period || !pool) { setLoadingData(false); return; }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error('The data request timed out. Please retry.')), 15000);
    setLoadingData(true);
    fetchEvidence({ version: 1, metric, period, pool, view: metric.startsWith('chain_') ? 'bar' : 'line', start: null, end: null }, controller.signal)
      .then(result => { if (!controller.signal.aborted) setEvidence(result); })
      .catch(() => { if (!controller.signal.aborted || controller.signal.reason instanceof Error && controller.signal.reason.name !== 'AbortError') setError('Source data is temporarily unavailable. Retry or open the source page.'); })
      .finally(() => { clearTimeout(timeout); if (!controller.signal.aborted || controller.signal.reason?.name !== 'AbortError') setLoadingData(false); });
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [metric, period, pool, activeId, refresh]);

  useEffect(() => { transcript.current?.scrollTo({ top: transcript.current.scrollHeight, behavior: 'instant' }); }, [session.messages.length, busy]);

  function updateSpec(next: AnalysisSpec, restore = false) {
    autoExplain.current = null;
    if (!restore && (next.metric !== spec?.metric || next.period !== spec?.period || next.pool !== spec?.pool)) next = { ...next, start: null, end: null };
    const validated = analysisSchema.parse(next);
    setSessions(all => all.map(item => item.id === activeId ? { ...item, spec: validated } : item));
    setTablePage(0);
  }

  function switchSession(id: number) {
    autoExplain.current = null;
    request.current?.abort(); request.current = null; setBusy(false); setActiveId(id); setQuestion(''); setSourcesOpen(false); setEvidence(null);
  }

  function newSession() {
    if (!hasMessages) { input.current?.focus(); return; }
    const id = ++serial.current;
    setSessions(all => [{ id, title: 'New analysis', messages: [], spec: null }, ...all].slice(0, 12));
    switchSession(id);
    requestAnimationFrame(() => input.current?.focus());
  }

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > 1000 || busy) return;
    setQuestion(''); setBusy(true); setCopied(false);
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 20000);
    const id = ++serial.current;
    const append = (answer: string, next?: AnalysisSpec) => setSessions(all => all.map(item => item.id === activeId ? {
      ...item, title: item.messages.length ? item.title : trimmed,
      messages: [...item.messages, { id, question: trimmed, answer, spec: next }].slice(-30),
      spec: next ?? item.spec,
    } : item));
    try {
      let next = resolveShortcut(trimmed, spec);
      if (!next) {
        if (capability.mode !== 'ai') {
          append('Free-form AI is not enabled in this preview. Choose an example question, or refine an analysis with “show 90 days” or “show as a table”. Pool analyses also support “just Orchard” or “just Ironwood”.');
          return;
        }
        const response = await fetch(`${getApiUrl()}/v1/ask`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: trimmed, context: spec }), signal: controller.signal, cache: 'no-store' });
        const { data, meta } = await readApiResponse<{ spec: unknown | null }>(response);
        if (meta.network !== 'mainnet') throw new Error('Wrong network');
        if (data.spec === null) { append('This question goes beyond the datasets currently supported in Ask. Try pool balances and flows, tracked cross-chain swaps, transaction activity, or recorded Network Pulse alerts.'); return; }
        next = analysisSchema.parse(data.spec);
      }
      if (controller.signal.aborted) return;
      autoExplain.current = capability.mode === 'ai' ? explanationRecipe(next) : null;
      append(`Opened ${describeMetric(next.metric).title.toLowerCase()} for ${next.period === '1y' ? 'the past year' : `the past ${next.period.slice(0, -1)} days`}${next.pool === 'all' ? '' : `, filtered to ${next.pool}`}. The analysis shows the source observations and updates as you change the controls.`, next);
      if (!hasMessages) requestAnimationFrame(() => workspace.current?.scrollIntoView({ block: 'start', behavior: 'instant' }));
    } catch {
      if (!controller.signal.aborted) append('Ask could not complete that request. Your current analysis is still available. Try again, or choose a starter question.');
      else if (request.current === controller) append('The request was stopped. You can try again or continue with a starter question.');
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) setBusy(false);
    }
  }

  function exportCsv() {
    if (!summary || !evidence) return;
    const rows = [[evidence.dimension === 'chain' ? 'chain' : 'date_utc', ...evidence.series.map(series => `${series.key}_${evidence.csvUnit}`)], ...summary.points.map(point => [point.date, ...evidence.series.map(series => point.values[series.key] ?? '')])];
    const url = URL.createObjectURL(new Blob([rows.map(row => row.join(',')).join('\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `zecblock-${spec?.metric}-${ranking ? spec?.period : `${summary.start}-${summary.end}`}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const composer = <form onSubmit={event => { event.preventDefault(); void ask(question); }} className={styles.composer}>
    <label htmlFor="ask-question" className="sr-only">Ask a question about Zcash</label>
    <textarea ref={input} id="ask-question" value={question} onChange={event => setQuestion(event.target.value)} rows={hasMessages ? 2 : 3} maxLength={1000}
      placeholder={hasMessages ? 'Ask a follow-up, or refine this view…' : 'Ask about Zcash. Start with the data.'}
      onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void ask(question); } }} />
    <div className="flex items-center justify-between gap-3 px-4 pb-3"><span className="text-caption font-mono text-muted">{capability.mode === 'ai' ? 'Public chain data' : 'Guided preview'}</span>
      {busy ? <button type="button" className={styles.submit} onClick={() => request.current?.abort()} aria-label="Stop response">■</button>
        : <button type="submit" className={styles.submit} disabled={!question.trim()} aria-label="Send question">↑</button>}
    </div>
  </form>;

  return <div className={styles.workspace} ref={workspace}>
    <aside className={styles.sidebar} aria-label="Ask workspace navigation">
      <button type="button" onClick={newSession} className={styles.newButton}><span aria-hidden="true">＋</span> New analysis</button>
      {sessions.some(item => item.messages.length) ? <label className={styles.mobileSessions}><span className="sr-only">Recent analyses</span><select aria-label="Recent analyses" value={activeId} onChange={event => switchSession(Number(event.target.value))}>{sessions.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label> : null}
      <div className={styles.sidebarContent}><p className="text-caption font-mono text-muted mt-8 mb-3">THIS SESSION</p>
        {sessions.some(item => item.messages.length) ? sessions.filter(item => item.messages.length).map(item => <button key={item.id} className={`${styles.session} ${activeId === item.id ? styles.selectedSession : ''}`} aria-current={activeId === item.id ? 'true' : undefined} onClick={() => switchSession(item.id)} title={item.title}>{item.title}</button>) : <p className="text-xs leading-relaxed text-muted">Your analyses will appear here.</p>}
        <p className="text-caption font-mono text-muted mt-9 mb-3">EXPLORE THE DATA</p>
        <Link href="/pools" className={styles.sourceLink}>Shielded pools <span>↗</span></Link>
        <Link href="/ironwood" className={styles.sourceLink}>Ironwood <span>↗</span></Link>
        <Link href="/crosschain" className={styles.sourceLink}>Cross-chain swaps <span>↗</span></Link>
        <Link href="/pulse" className={styles.sourceLink}>Network Pulse <span>↗</span></Link>
        <Link href="/rich-list" className={styles.sourceLink}>Transparent addresses <span>↗</span></Link>
        <Link href="/privacy" className={styles.sourceLink}>Privacy score <span>↗</span></Link>
        <Link href="/charts" className={styles.sourceLink}>Chart library <span>↗</span></Link>
      </div>
      <div className={styles.sessionNote}><span className="text-secondary">A temporary workspace</span><p className="mt-2">Analyses stay in this page session. Reloading or leaving clears them.</p></div>
    </aside>

    <div className={`${styles.main} ${hasMessages ? styles.active : ''}`}>
      {!hasMessages ? <div className={styles.welcome}>
        <AskMark /><h2 className="text-3xl sm:text-4xl font-medium tracking-tight text-primary mt-6">Follow your curiosity.</h2>
        <p className="mt-3 mb-8 text-secondary text-sm sm:text-base leading-relaxed">Ask a question. Find the signal.<br className="sm:hidden" /> Make the data your own.</p>
        {composer}
        <div className="flex flex-wrap gap-2 mt-6" role="group" aria-label="Example question categories">{categories.map(category => <button type="button" key={category} aria-pressed={exampleCategory === category} onClick={() => setExampleCategory(category)} className={`${styles.followup} ${exampleCategory === category ? styles.selectedCategory : ''}`}>{category}</button>)}</div>
        <div className={styles.starters}>{examples.map((starter, index) => <button key={starter.id} onClick={() => void ask(starter.title)} className={styles.starter}>
          <span className="flex justify-between items-center text-caption font-mono text-muted"><span>{starter.category}</span><span aria-hidden="true">0{index + 1}</span></span>
          <span className="block mt-3 text-sm text-primary font-medium">{starter.title}</span><span className="block mt-2 text-xs text-muted leading-relaxed">{starter.detail}</span>
        </button>)}</div>
        <p className="mt-6 text-caption leading-relaxed text-muted">{capability.mode === 'ai' ? `Questions and the current analysis settings are sent to ${capability.provider}. Do not include wallet secrets or private information.` : 'Starter questions use indexed public data. Free-form AI is not enabled yet.'}</p>
      </div> : <>
        <section className={styles.conversation} aria-label="Conversation">
          <div className={styles.transcript} ref={transcript}>
            {session.messages.map(message => <div key={message.id} className="mb-7">
              <div className="ml-8 border border-cipher-border bg-cipher-surface rounded-lg px-4 py-3 text-sm text-primary leading-relaxed break-words">{message.question}</div>
              <div className="flex gap-3 mt-5"><AskMark small /><div className="min-w-0"><p className="text-caption font-mono text-muted mb-2">ZecBlock</p><p className="text-sm text-secondary leading-relaxed">{message.answer}</p>
                {message.spec && viewKey(message.spec) !== viewKey(spec) ? <button onClick={() => updateSpec(message.spec!, true)} className="mt-3 text-caption font-mono text-cipher-gold hover:underline">Restore this view →</button> : null}
              </div></div>
            </div>)}
            {evidence && spec && summary?.points.length && !invalidDates ? <AskInsights key={JSON.stringify([evidence.key, spec.start, spec.end, evidence.receivedAt])} spec={spec} evidence={evidence} enabled={capability.mode === 'ai'} autoExplain={autoExplain} /> : null}
            {busy ? <p className="text-sm text-muted py-3" role="status">Interpreting your question…</p> : null}
          </div>
          <div className={styles.conversationFooter}>
            <div className="flex flex-wrap gap-2 mb-3">{(spec ? ranking ? ['Show as a bar chart', 'Show as a table'] : ['Show 90 days', poolMetric ? spec.pool === 'ironwood' ? 'Just Orchard' : 'Just Ironwood' : 'Show as a line chart', 'Show as a table'] : starters.slice(0, 2).map(item => item.title)).map(text => <button key={text} disabled={busy} onClick={() => void ask(text)} className={styles.followup}>{text}</button>)}</div>
            {composer}<p className="mt-3 text-caption text-muted leading-relaxed">{capability.mode === 'ai' ? `Questions are sent to ${capability.provider}. Use public information only.` : 'Guided preview · No AI provider connected.'}</p>
          </div>
        </section>

        <section className={styles.analysis} aria-label="Current analysis" aria-busy={loadingData}>
          <div className="flex justify-between items-center gap-3 border-b border-cipher-border px-5 py-4"><span className="text-caption font-mono text-muted">ANALYSIS</span><div className="flex gap-4"><button className="text-caption text-muted hover:text-primary disabled:opacity-40" onClick={() => setRefresh(value => value + 1)} disabled={!spec || loadingData}>Refresh</button><button className="text-caption text-muted hover:text-primary disabled:opacity-40" onClick={exportCsv} disabled={!summary?.points.length || invalidDates}>Export CSV ↗</button></div></div>
          {!spec ? <div className="p-8 text-sm text-muted leading-relaxed">Choose a starter question to open an analysis here. Its chart, controls and source data will stay alongside your conversation.</div> : <div className="p-4 sm:p-5">
            <h2 className="text-xl text-primary font-medium tracking-tight">{info?.title}</h2>
            <p className="mt-2 text-caption font-mono text-muted">MAINNET · {ranking ? 'LAST 30 DAYS · BY CHAIN' : 'DAILY'} · {spec.metric === 'activity' ? 'FLOW RECORDS' : info?.unit.toUpperCase()}</p>
            <div className={`${styles.controls} ${!poolMetric ? styles.twoControls : ''}`}>
              <label>Period<select disabled={ranking} value={spec.period} onChange={event => updateSpec({ ...spec, period: event.target.value as AnalysisSpec['period'] })}><option value="30d">Last 30 days</option>{!ranking ? <option value="90d">Last 90 days</option> : null}{!ranking && !spec.metric.startsWith('swap_') ? <option value="1y">Last year</option> : null}</select></label>
              {poolMetric ? <label>Pool<select value={spec.pool} onChange={event => updateSpec({ ...spec, pool: event.target.value as AnalysisSpec['pool'] })}><option value="all">All pools</option><option value="orchard">Orchard</option><option value="ironwood">Ironwood</option><option value="sapling">Sapling</option></select></label> : null}
              <label>View<select value={spec.view} onChange={event => updateSpec({ ...spec, view: event.target.value as AnalysisSpec['view'] })}>{!ranking ? <option value="line">Line chart</option> : null}<option value="bar">Bar chart</option><option value="table">Table</option></select></label>
            </div>
            {loadingData ? <div className="h-80 grid place-items-center text-sm text-muted" role="status">Reading indexed observations…</div> : error ? <div className="py-20 text-center text-sm text-secondary" role="alert"><p>{error}</p><button onClick={() => setRefresh(value => value + 1)} className="mt-4 text-cipher-gold hover:underline">Retry</button><Link href={describeMetric(spec.metric).source} className="ml-5 text-cipher-gold hover:underline">Open source ↗</Link></div> : evidence && summary ? <>
              {!ranking ? <div className={styles.dateRange}><label>From (UTC)<input type="date" value={start || evidence.points[0]?.date || ''} min={evidence.points[0]?.date} max={end || evidence.points.at(-1)?.date} onChange={event => { if (event.target.validity.valid) updateSpec({ ...spec, start: event.target.value || null }); }} /></label><label>To (UTC)<input type="date" value={end || evidence.points.at(-1)?.date || ''} min={start || evidence.points[0]?.date} max={evidence.points.at(-1)?.date} onChange={event => { if (event.target.validity.valid) updateSpec({ ...spec, end: event.target.value || null }); }} /></label></div> : null}
              {invalidDates ? <p role="alert" className="py-8 text-sm text-warning">Choose an end date on or after the start date.</p> : !summary.points.length ? <p className="py-20 text-sm text-muted text-center" role="status">{spec.metric === 'pulse' ? 'No recorded alerts are available for this window. This does not establish that every detector ran or that the network was healthy.' : 'No observations are available for this window.'}</p> : <>
                <div className={styles.metrics}>{summary.totals.map(item => <div key={item.key}><p className="flex gap-2 items-center text-caption text-muted"><span className="w-1.5 h-1.5 inline-block" style={{ backgroundColor: colors[item.color as keyof typeof colors] }} />{item.label}</p><p className="mt-2 font-mono text-lg tabular-nums text-primary">{formatValue(item.value, evidence.unit)}{evidence.unit === '%' ? '%' : ''}</p><p className="mt-1 text-caption text-muted">{spec.metric === 'migration_share' ? item.change === null ? 'Change unavailable' : `${formatValue(item.change, '%', true)} percentage points` : spec.metric === 'balances' ? item.change === null ? 'Change unavailable' : `${formatValue(item.change, evidence.unit, true)} ZEC change` : `${evidence.unit} ${ranking ? 'across ranked chains' : 'in returned days'}`}</p></div>)}</div>
                {spec.view === 'table' ? <div className="overflow-x-auto"><table className={styles.table}><caption className="sr-only">{ranking ? 'Chain rankings' : 'Daily observations'} in {evidence.unit}; displayed ZEC rounded to two decimal places. CSV uses {evidence.csvUnit}; USD valuations are approximate.</caption><thead><tr><th>{ranking ? 'Chain' : 'Date (UTC)'}</th>{evidence.series.map(series => <th key={series.key}>{series.label} ({evidence.unit})</th>)}</tr></thead><tbody>{summary.points.slice(tablePage * 15, (tablePage + 1) * 15).map(point => <tr key={point.date}><th>{ranking ? formatChain(point.date) : point.date}</th>{evidence.series.map(series => <td key={series.key}>{formatValue(point.values[series.key], evidence.unit)}</td>)}</tr>)}</tbody></table><div className="flex justify-between gap-3 py-4 text-caption text-muted"><button disabled={tablePage === 0} onClick={() => setTablePage(value => value - 1)} className="disabled:opacity-40">← Previous</button><span>Page {tablePage + 1} of {Math.ceil(summary.points.length / 15)}</span><button disabled={(tablePage + 1) * 15 >= summary.points.length} onClick={() => setTablePage(value => value + 1)} className="disabled:opacity-40">Next →</button></div></div> : <AskChart points={summary.points} evidence={evidence} view={spec.view} />}
                <div className="flex justify-between gap-3 text-caption font-mono text-muted pt-2"><span>{ranking ? 'Rolling past 30 days' : `${summary.start} — ${summary.end} UTC`}</span><span>zecblock.com</span></div>
                <div className="border-t border-cipher-border mt-5 pt-4"><p className="text-xs text-muted leading-relaxed mb-3">{evidence.note}</p><p className="text-sm text-secondary leading-relaxed">{ranking ? `Showing ${summary.points.length} chains ranked by tracked swap volume. Bar chart shows the top 10; the table and CSV include every returned chain.` : spec.metric === 'migration_share' ? `Latest observed share: ${summary.end}. Percentages compare pool balances on each returned day.` : spec.metric === 'balances' ? `Showing ${summary.points.length} daily snapshots. Headline balances are from ${summary.end}; changes compare the first and last returned observations.` : `Totals cover ${summary.points.length} returned daily buckets. Boundary days may be partial; absent days are not assumed to be zero.`}</p></div>
              </>}
              <div className="flex flex-wrap items-center justify-between gap-3 mt-5"><button onClick={() => setSourcesOpen(value => !value)} aria-expanded={sourcesOpen} aria-controls="ask-sources" className="text-caption font-mono text-cipher-gold hover:underline">{sourcesOpen ? '−' : '+'} Source & methodology</button><span className="text-caption text-muted">Freshness: {evidence.meta.freshness?.status ?? 'unknown'}</span></div>
              {sourcesOpen ? <div id="ask-sources" className="border-t border-cipher-border mt-4 pt-4 text-xs text-muted leading-relaxed"><Link href={evidence.source} className="text-secondary hover:text-cipher-gold">{evidence.sourceLabel} · Indexed public data ↗</Link><p className="mt-3">{evidence.note}</p><p className="mt-3">Retrieved {evidence.receivedAt.replace('T', ' ').slice(0, 19)} UTC. Source observation time: {evidence.meta.source?.observedAt ?? 'unavailable'}. CSV exports use {evidence.csvUnit}. ZEC values retain exact zatoshis; USD valuations remain approximate.</p><button className="mt-3 text-cipher-gold hover:underline" onClick={async () => { try { await navigator.clipboard.writeText(`https://zecblock.com${evidence.source}`); setCopied(true); } catch { setCopied(false); } }}>{copied ? 'Source link copied' : 'Copy source link'}</button></div> : null}
            </> : null}
          </div>}
        </section>
      </>}
    </div>
    <span className="sr-only" role="status" aria-live="polite">{busy ? 'Interpreting question.' : loadingData ? 'Loading analysis.' : error ? 'Source unavailable.' : summary ? `Analysis ready. ${summary.points.length} observations.` : session.messages.at(-1)?.answer ?? ''}</span>
  </div>;
}
