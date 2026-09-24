import type { ZodType } from 'zod';
import type { AnalysisSpec } from './contract';
export type AskLocale = 'auto' | 'en' | 'fr' | 'es' | 'de' | 'pt' | 'ja' | 'zh' | 'ko' | 'ar' | 'ru';
export interface AskSource { id: string; title: string; url: string; reviewed: string }
export interface AskReply { answer: string; sources: AskSource[]; spec: AnalysisSpec | null; locale: string; mode: 'guided' | 'ai'; evidenceKey?: string; scope?: string }
export interface AskTurn extends AskReply { question: string }
export interface ChatRequest { question: string; page: string; context: AnalysisSpec | null; locale: AskLocale; history: string[]; challenge?: string }
export const chatRequestSchema: ZodType<ChatRequest>;
export const locales: string[];
