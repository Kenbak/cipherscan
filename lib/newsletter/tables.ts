import type { ParsedTable } from './types';

export function removeSubsectionBlock(body: string, title: string): string {
  const parts = body.split(/^### /gm);
  if (parts.length <= 1) return body.trim();

  const kept: string[] = [parts[0]];
  for (let i = 1; i < parts.length; i++) {
    const nl = parts[i].indexOf('\n');
    const subTitle = nl === -1 ? parts[i].trim() : parts[i].slice(0, nl).trim();
    if (subTitle !== title) {
      kept.push(`### ${parts[i]}`);
    }
  }
  return kept.join('').trim();
}

export function removeAllSubsections(body: string, titles: string[]): string {
  let remaining = body;
  for (const title of titles) {
    remaining = removeSubsectionBlock(remaining, title);
  }
  return remaining.trim();
}

export function getLeadingProse(body: string): string {
  const idx = body.search(/^### /m);
  if (idx === -1) return body.trim();
  return body.slice(0, idx).trim();
}

const HEADER_LABELS = new Set(['metric', 'crate', 'date', 'event', 'direction', 'volume', 'swaps']);

function isHeaderRow(cells: string[]): boolean {
  const label = cells[0]?.replace(/\*\*/g, '').trim().toLowerCase() ?? '';
  return HEADER_LABELS.has(label);
}

export function parseMarkdownTableBlock(block: string): ParsedTable | null {
  const rows = block.trim().split('\n').filter((r) => r.trim());
  if (rows.length < 2) return null;

  const parseRow = (row: string) => row.split('|').slice(1, -1).map((c) => c.trim());
  const isSeparator = (row: string) => /^\|[\s\-:|]+\|$/.test(row.trim());
  const headers = parseRow(rows[0]);
  const dataStart = isSeparator(rows[1]) ? 2 : 1;
  const dataRows: string[][] = [];

  for (let i = dataStart; i < rows.length; i++) {
    const cells = parseRow(rows[i]);
    if (isHeaderRow(cells)) continue;
    dataRows.push(cells);
  }

  return { headers, rows: dataRows };
}

export function extractMarkdownTables(text: string): ParsedTable[] {
  const tables: ParsedTable[] = [];
  const regex = /((?:^\|.+\|$\n?)+)/gm;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const parsed = parseMarkdownTableBlock(match[1]);
    if (parsed && parsed.rows.length > 0) tables.push(parsed);
  }

  return tables;
}
