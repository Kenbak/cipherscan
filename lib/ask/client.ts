import { readApiResponse } from '@/lib/api-client';
import { getApiUrl } from '@/lib/api-config';
import type { AskLocale, AskReply, AskTurn } from './chat';
import type { AnalysisSpec } from './contract';
export interface AskCapability { mode: 'guided' | 'ai'; provider: string | null; siteKey?: string | null }
export async function askCapability(signal: AbortSignal): Promise<AskCapability> {
  const response = await fetch(`${getApiUrl()}/v1/ask`, { signal, cache: 'no-store' });
  const { data, meta } = await readApiResponse<AskCapability>(response);
  if (meta.network !== 'mainnet') throw new Error('Wrong network');
  return data;
}
export async function askChat(question: string, page: string, context: AnalysisSpec | null, locale: AskLocale, history: string[], challenge: string, signal: AbortSignal): Promise<AskReply> {
  const response = await fetch(`${getApiUrl()}/v1/ask/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', signal, body: JSON.stringify({ question, page, context, locale, history: history.slice(-4), challenge }) });
  const { data, meta } = await readApiResponse<AskReply>(response);
  if (meta.network !== 'mainnet') throw new Error('Wrong network');
  return data;
}
export interface AskHandoff { turns: AskTurn[]; spec: AnalysisSpec | null; page: string }
// Memory only, never URL parameters, browser storage or analytics.
let handoff: AskHandoff | null = null;
export function saveAskHandoff(value: AskHandoff) { handoff = { ...value, turns: value.turns.slice(-12) }; }
export function peekAskHandoff() { return handoff; }
export function clearAskHandoff() { handoff = null; }
