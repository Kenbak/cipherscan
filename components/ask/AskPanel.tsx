'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { describePage } from '@/lib/ask/pages';
import { askCapability, askChat, saveAskHandoff, type AskCapability } from '@/lib/ask/client';
import type { AnalysisSpec } from '@/lib/ask/contract';
import type { AskTurn } from '@/lib/ask/chat';
import { AskChallenge } from './AskChallenge';
import { AskTransfers } from './AskTransfers';
import { AskSources } from './AskSources';
import { analysisFollowUps } from '@/lib/ask/follow-ups';

export default function AskPanel({ pathname, open, onClose, initialSpec }: { pathname: string; open: boolean; onClose: () => void; initialSpec?: AnalysisSpec }) {
  const page = describePage(pathname);
  const [turns, setTurns] = useState<AskTurn[]>([]);
  const [question, setQuestion] = useState('');
  const [spec, setSpec] = useState<AnalysisSpec | null>(initialSpec || page.spec || null);
  const [capability, setCapability] = useState<AskCapability>({ mode: 'guided', provider: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [token, setToken] = useState('');
  const [reset, setReset] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController | null>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const autoStarted = useRef(false);
  const [capabilityLoaded, setCapabilityLoaded] = useState(false);
  const router = useRouter();
  useEffect(() => {
    const controller = new AbortController();
    askCapability(controller.signal).then(value => { setCapability(value); setCapabilityLoaded(true); }).catch(() => {});
    return () => { controller.abort(); request.current?.abort(); request.current = null; };
  }, []);
  useEffect(() => {
    if (!open) { dialog.current?.close(); request.current?.abort(); return; }
    dialog.current?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);
  useEffect(() => { transcript.current?.scrollTo({ top: transcript.current.scrollHeight, behavior: 'instant' }); }, [turns.length, busy]);
  const send = useCallback(async (text: string) => {
    if (request.current || !text.trim()) return;
    const controller = new AbortController(); request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 45000);
    setBusy(true); setError('');
    try {
      const reply = await askChat(text.trim(), page.id, spec, 'auto', turns.map(turn => turn.question), token, controller.signal);
      if (controller.signal.aborted) return;
      setTurns(all => [...all, { ...reply, question: text.trim() }].slice(-12));
      if (reply.transfers) setSpec(null); else if (reply.spec) setSpec(reply.spec);
      setQuestion('');
    } catch {
      if (request.current === controller) setError(capability.mode === 'ai' ? 'Ask could not answer. Check verification or try again; usage limits may apply.' : 'AI is not connected yet. Try “Explain this page” for its reviewed guide.');
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) { request.current = null; setBusy(false); setToken(''); setReset(value => value + 1); }
    }
  }, [page.id, spec, token, turns, capability.mode]);
  useEffect(() => {
    if (!initialSpec || !open || !capabilityLoaded || autoStarted.current || capability.mode === 'ai' && !token) return;
    autoStarted.current = true;
    void send('Explain this chart');
  }, [initialSpec, open, capabilityLoaded, capability.mode, token, send]);
  function expand() { saveAskHandoff({ turns, spec, page: page.id }); onClose(); router.push('/ask'); }
  const suggestions = page.id === 'ironwood' ? ['Explain this page', 'What does migration progress measure?'] : page.id === 'crosschain' ? ['Explain this page', 'Does this include every exchange?'] : page.id === 'pulse' ? ['Explain this page', 'Does an anomaly mean something is wrong?'] : ['Explain this page', 'What is Zodl?', 'What is Zebra?'];
  const blocked = busy || capability.mode === 'ai' && !token;
  return <dialog ref={dialog} id="ask-page-panel" aria-labelledby="ask-panel-title" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === dialog.current) onClose(); }} className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-dvh w-full max-w-md border-l border-cipher-border bg-cipher-bg p-0 text-primary shadow-2xl backdrop:bg-black/40">
    <div className="flex h-full min-h-0 flex-col" onClick={event => event.stopPropagation()}>
      <header className="flex items-center justify-between gap-3 border-b border-cipher-border p-4"><h2 id="ask-panel-title" className="text-base font-medium"><span className="mr-2 font-mono text-cipher-gold">&gt;_</span>Ask ZecBlock</h2><div className="flex items-center gap-4"><button onClick={expand} disabled={busy} className="text-xs text-muted hover:text-primary">Open in Ask ↗</button><button onClick={onClose} aria-label="Close Ask" className="p-2 text-secondary">✕</button></div></header>
      <div className="border-b border-cipher-border px-4 py-3"><p className="text-xs text-secondary">{page.title} · Mainnet</p><p className="mt-1 text-caption text-muted">{spec ? `${initialSpec ? 'Chart analysis' : 'Analysis'}: ${spec.period} · ${spec.pool === 'all' ? 'all pools / network' : spec.pool}` : 'Page guide · public concepts'}</p></div>
      <div ref={transcript} className="min-h-0 flex-1 overflow-y-auto p-4" aria-live="polite">
        {!turns.length ? <div className="py-6"><h3 className="text-xl font-medium tracking-tight">Make sense of what you see.</h3><p className="mt-3 text-sm leading-relaxed text-secondary">Explore the data, understand the terms, or ask a follow-up in your language.</p><div className="mt-5 flex flex-wrap gap-2">{suggestions.map(text => <button key={text} onClick={() => void send(text)} disabled={blocked} className="rounded-lg border border-cipher-border px-3 py-2 text-left text-xs text-secondary hover:border-cipher-gold disabled:opacity-50">{text}</button>)}</div></div> : null}
        {turns.map((turn, index) => <article key={index} className="mb-6"><p dir="auto" className="ml-6 rounded-lg border border-cipher-border bg-cipher-surface p-3 text-sm">{turn.question}</p><div dir="auto" lang={turn.locale} className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-secondary">{turn.answer}</div><AskTransfers result={turn.transfers} /><AskSources sources={turn.sources} />{turn.scope ? <p className="mt-2 text-caption text-muted">{turn.scope}</p> : null}{turn.spec ? <button onClick={expand} className="mt-3 text-xs text-cipher-gold">Explore this analysis →</button> : null}</article>)}
        {busy ? <p role="status" className="text-sm text-muted">Looking at the context…</p> : null}
      </div>
      <footer className="border-t border-cipher-border p-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        {capability.mode === 'ai' && turns.length > 0 && turns.at(-1)?.locale === 'en' && spec ? <div className="mb-3 flex flex-wrap gap-2" aria-label="Explore next">{analysisFollowUps(spec).map(text => <button key={text} type="button" disabled={blocked} onClick={() => void send(text)} className="rounded-lg border border-cipher-border px-3 py-2 text-left text-xs text-secondary hover:border-cipher-gold disabled:opacity-50">{text}</button>)}</div> : null}
        <form onSubmit={event => { event.preventDefault(); void send(question); }} className="rounded-xl border border-cipher-border bg-cipher-surface p-3"><label htmlFor="ask-widget-question" className="sr-only">Ask about this page</label><textarea id="ask-widget-question" dir="auto" value={question} onChange={event => setQuestion(event.target.value)} maxLength={1000} rows={2} placeholder="Ask about this page…" className="w-full resize-none bg-transparent text-sm outline-none" onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!blocked) void send(question); } }} /><div className="flex items-center justify-between gap-2"><span className="text-caption text-muted">{capability.mode === 'ai' ? 'Public sources' : 'Reviewed guides'}</span>{busy ? <button type="button" onClick={() => request.current?.abort()} className="text-xs text-secondary">Stop</button> : <button disabled={blocked || !question.trim()} aria-label="Send question" className="rounded bg-brand-gold px-3 py-1 text-black disabled:opacity-40">↑</button>}</div></form>
        <AskChallenge siteKey={capability.siteKey} onToken={setToken} reset={reset} />
        {error ? <p role="alert" className="mt-2 text-xs text-warning">{error}</p> : null}<p className="mt-2 text-caption leading-relaxed text-muted">{capability.mode === 'ai' ? `Questions and recent context go to ${capability.provider}. Never share wallet secrets.` : 'AI is not connected. Reviewed guides are available in English.'}</p>
      </footer>
    </div>
  </dialog>;
}
