import type { ZodType } from 'zod';
import type { AnalysisSpec } from './contract';
export type AskLocale = 'auto' | 'en' | 'fr' | 'es' | 'de' | 'pt' | 'ja' | 'zh' | 'ko' | 'ar' | 'ru';
export interface AskSource { id: string; title: string; url: string; reviewed: string }
export interface AskTransfers { direction: 'shield' | 'deshield'; pool: string; start: string; end: string; retrievedAt: string; complete: boolean; groups: { kind: 'latest' | 'largest'; rows: { txid: string; blockHeight: number; blockTime: number; pools: string[]; amountZat: string; amountAuthority: string }[] }[] }
export interface AskDataContext { start: string | null; end: string | null; retrievedAt: string; source: string; label: string }
export interface AskBlocks { status: 'found' | 'not-found' | 'orphaned'; query: { mode: 'latest' | 'recent' | 'detail'; identifier: string | null }; rows: { height: number; hash: string; timestamp: number; transactions: number; size: number; feesZat: string | null; miner: string | null; software: string }[]; retrievedAt?: string }
export interface AskTransactions { status: 'found' | 'not-found'; query: { mode: 'latest' | 'detail'; txid: string | null; limit: number }; rows: { txid: string; status: 'confirmed' | 'indexed' | 'pending' | 'stale' | 'unknown'; blockHeight: number | null; blockHash: string | null; timestamp: number | null; confirmations: number | null; size: number | null; feeZat: string | null; coinbase: boolean | null; pools: string[]; componentsKnown: boolean; transparentInputs: number | null; transparentOutputs: number | null }[]; retrievedAt: string }
export interface AskReply { transactions?: AskTransactions; blocks?: AskBlocks; dataContext?: AskDataContext; answer: string; sources: AskSource[]; spec: AnalysisSpec | null; locale: string; mode: 'guided' | 'ai'; transfers?: AskTransfers; evidenceKey?: string; scope?: string }
export interface AskTurn extends AskReply { question: string }
export interface ChatRequest { transaction?: string; block?: string; question: string; page: string; context: AnalysisSpec | null; locale: AskLocale; history: string[]; challenge?: string }
export const chatRequestSchema: ZodType<ChatRequest>;
export const locales: string[];
