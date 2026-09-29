import { ApiError, readApiResponse } from '@/lib/api-client';
import { getApiUrl } from '@/lib/api-config';
import type { AskLocale, AskReply, AskTurn } from './chat';
import type { AnalysisSpec } from './contract';
export function askErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return 'Ask has reached its allowance. Try later; starter charts remain available.';
    if (error.code === 'ask-verification') return 'Verification expired or failed. Retry verification, then send your question again.';
    if (error.code === 'ask-source') return 'Source data is temporarily unavailable. Try again shortly; your current analysis is still available.';
    if (error.code === 'ask-answer') return 'Ask could not validate the answer. Try a more specific question or open the source chart.';
    if (error.code === 'ask-provider') return 'The AI provider is temporarily unavailable. Starter charts remain available.';
    if (error.status === 504) return 'The request took too long. Try a shorter period or a more specific question.';
  }
  if (error instanceof Error && error.name === 'TimeoutError') return 'The request took too long. Please try again.';
  return 'Ask is temporarily unavailable. Please try again or choose a starter chart.';
}
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
