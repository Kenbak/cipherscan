import type { AnalysisSpec } from './contract';
export interface AskPageContext { id: string; title: string; topic: string; spec?: AnalysisSpec; questions?: string[] }
export function describePage(pathname: string): AskPageContext;
export function pageById(id: string): AskPageContext;
export const pageIds: string[];
