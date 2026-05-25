import type {
  ParsedGrantGroup,
  ParsedQuote,
  ParsedSection,
  ParsedSubsection,
  ParsedTable,
  ParsedTimelineItem,
  ParsedToolUpdate,
  SectionKind,
} from './types';
import {
  extractMarkdownTables,
  getLeadingProse,
  removeAllSubsections,
} from './tables';

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function classifySection(title: string): { kind: SectionKind; privacyCornerTitle?: string } {
  const lower = title.toLowerCase();

  if (lower.startsWith('privacy corner')) {
    const privacyCornerTitle = title.replace(/^privacy corner:\s*/i, '').trim();
    return { kind: 'privacy-corner', privacyCornerTitle: privacyCornerTitle || title };
  }
  if (lower === 'top stories') return { kind: 'top-stories' };
  if (lower === 'ecosystem') return { kind: 'ecosystem' };
  if (lower.includes('governance')) return { kind: 'governance' };
  if (lower.includes('protocol')) return { kind: 'protocol' };
  if (lower.includes('tweets')) return { kind: 'tweets' };
  if (lower.includes('forum highlights')) return { kind: 'forum-highlights' };
  if (lower === 'network snapshot') return { kind: 'network-snapshot' };
  if (lower.includes('privacy index')) return { kind: 'privacy-index' };
  if (lower.includes('privacy risk')) return { kind: 'generic' };
  if (lower === 'tool updates') return { kind: 'tool-updates' };
  if (lower.includes("what's ahead") || lower.includes('whats ahead')) return { kind: 'whats-ahead' };

  return { kind: 'generic' };
}

function normalizePrivacyIndexBody(body: string): string {
  return body.replace(/^\*\*(?!Editorial)(.+?)\*\*\s*$/gm, (_, title) => `### ${title.trim()}`);
}

function parseSubsections(body: string): ParsedSubsection[] {
  const parts = body.split(/^### /gm);
  if (parts.length <= 1) return [];

  return parts
    .slice(1)
    .map((part) => {
      const newline = part.indexOf('\n');
      if (newline === -1) return { title: part.trim(), body: '' };
      return {
        title: part.slice(0, newline).trim(),
        body: part.slice(newline + 1).trim(),
      };
    })
    .filter((s) => s.title);
}

function parseBulletSubsections(body: string): ParsedSubsection[] {
  const parts = body.split(/\n(?=[\-\*] \*\*)/).filter((p) => /^[\-\*] \*\*/.test(p.trim()));

  return parts
    .map((part) => {
      const trimmed = part.replace(/^[\-\*]\s*/, '').trim();
      const match = trimmed.match(/^\*\*(.+?)\*\*[.\s—\-–]*\s*([\s\S]*)$/);
      if (!match) return null;
      return { title: match[1].trim(), body: match[2].trim() };
    })
    .filter((s): s is ParsedSubsection => s !== null && s.title.length > 0);
}

function resolveSubsections(body: string, kind: SectionKind): ParsedSubsection[] {
  const fromHeaders = parseSubsections(body);
  if (fromHeaders.length > 0) return fromHeaders;

  if (kind === 'ecosystem' || kind === 'protocol' || kind === 'forum-highlights') {
    return parseBulletSubsections(body);
  }

  return [];
}

function parseTables(body: string): ParsedTable[] {
  return extractMarkdownTables(body);
}

function parseQuotes(body: string): ParsedQuote[] {
  return body
    .split(/\n\n+/)
    .filter((block) => block.trim().startsWith('>'))
    .map((block) => {
      const lines = block.split('\n').map((l) => l.replace(/^> /, ''));
      const last = lines[lines.length - 1]?.trim() ?? '';

      if (last.startsWith('— ') || last.startsWith('-- ')) {
        return {
          text: lines.slice(0, -1).join('\n').trim(),
          attribution: last.replace(/^—\s*/, '').replace(/^--\s*/, '').trim(),
        };
      }

      return { text: lines.join('\n').trim(), attribution: '' };
    })
    .filter((q) => q.text);
}

function parseTimeline(body: string): ParsedTimelineItem[] {
  const items: ParsedTimelineItem[] = [];
  const regex = /^[\-\*] \*\*(.+?)\*\* — (.+)$/gm;
  let match;

  while ((match = regex.exec(body)) !== null) {
    items.push({ date: match[1].trim(), event: match[2].trim() });
  }

  if (items.length > 0) return items;

  const altRegex = /^[\-\*] \*\*(.+?)\*\* - (.+)$/gm;
  while ((match = altRegex.exec(body)) !== null) {
    items.push({ date: match[1].trim(), event: match[2].trim() });
  }

  return items;
}

function parseTimelineFromTable(body: string): ParsedTimelineItem[] {
  for (const table of extractMarkdownTables(body)) {
    const dateCol = table.headers.findIndex((h) => /date/i.test(h.replace(/\*\*/g, '')));
    const eventCol = table.headers.findIndex((h) => /event/i.test(h.replace(/\*\*/g, '')));
    if (dateCol >= 0 && eventCol >= 0) {
      return table.rows.map((row) => ({
        date: row[dateCol]?.replace(/\*\*/g, '').trim() ?? '',
        event: row[eventCol]?.replace(/\*\*/g, '').trim() ?? '',
      }));
    }
  }
  return [];
}

function parseToolUpdates(body: string): ParsedToolUpdate[] {
  const updates: ParsedToolUpdate[] = [];
  const regex = /^[\-\*] \*\*(.+?)\*\* — (.+)$/gm;
  let match;

  while ((match = regex.exec(body)) !== null) {
    updates.push({ name: match[1].trim(), description: match[2].trim() });
  }

  if (updates.length > 0) return updates;

  const altRegex = /^[\-\*] \*\*(.+?)\*\* - (.+)$/gm;
  while ((match = altRegex.exec(body)) !== null) {
    updates.push({ name: match[1].trim(), description: match[2].trim() });
  }

  return updates;
}

function parseToolUpdatesBold(body: string): ParsedToolUpdate[] {
  const parts = body.split(/\n(?=\*\*)/).filter((p) => /^\*\*[^*]+\*\*/.test(p.trim()));

  return parts
    .map((part) => {
      const match = part.trim().match(/^\*\*(.+?)\*\*:?\s*([\s\S]+)/);
      if (!match) return null;
      return { name: match[1].trim(), description: match[2].trim() };
    })
    .filter((u): u is ParsedToolUpdate => u !== null);
}

function resolveToolUpdates(body: string, subsections: ParsedSubsection[]): ParsedToolUpdate[] {
  const fromBullets = parseToolUpdates(body);
  if (fromBullets.length > 0) return fromBullets;

  const fromBold = parseToolUpdatesBold(body);
  if (fromBold.length > 0) return fromBold;

  if (subsections.length > 0) {
    return subsections.map((sub) => ({
      name: sub.title,
      description: sub.body.trim(),
    }));
  }

  return [];
}

function parseGrantGroups(body: string): ParsedGrantGroup[] {
  const groups: ParsedGrantGroup[] = [];
  const labelRegex =
    /^\*\*(Approved[^*]*|Under [Rr]eview[^*]*|Declined[^*]*|New(?:ly [Ff]iled)?[^*]*|Previously [Aa]pproved[^*]*|Recently [Dd]eclined[^*]*)\*\*:?\s*$/gm;
  const matches = [...body.matchAll(labelRegex)];

  if (matches.length === 0) return groups;

  for (let i = 0; i < matches.length; i++) {
    const label = matches[i][1].trim();
    const start = (matches[i].index ?? 0) + matches[i][0].length;
    const end = i < matches.length - 1 ? (matches[i + 1].index ?? body.length) : body.length;
    const chunk = body.slice(start, end).trim();

    const items = chunk
      .split('\n')
      .map((l) => l.replace(/^[\-\*]\s+/, '').trim())
      .filter(Boolean);

    let variant: ParsedGrantGroup['variant'] = 'neutral';
    const lower = label.toLowerCase();
    if (lower.startsWith('approved') || lower.includes('previously approved')) variant = 'approved';
    else if (lower.includes('review')) variant = 'review';
    else if (lower.startsWith('declined') || lower.includes('recently declined')) variant = 'declined';
    else if (lower.startsWith('new')) variant = 'new';

    groups.push({ label, variant, items });
  }

  return groups;
}

function stripTables(body: string): string {
  return body.replace(/((?:^\|.+\|$\n?)+)/gm, '').trim();
}

function stripBlockquotes(body: string): string {
  return body.replace(/^> .+$/gm, '').trim();
}

function stripListItems(body: string, pattern: RegExp): string {
  return body.replace(pattern, '').trim();
}

function cleanPrivacyIndexProse(prose: string): string {
  return prose
    .replace(/^\*\*Editorial[^*]*:\*\*\s*/gm, '')
    .replace(/^\*\*Editorial note:\*\*\s*/gm, '')
    .replace(/^→\s*/gm, '')
    .replace(/^Live data:\s*/gm, '')
    .trim();
}

function splitPrivacyIndexContent(subsections: ParsedSubsection[]): {
  subsections: ParsedSubsection[];
  editorial: string;
} {
  let editorial = '';
  const trimmed = subsections.map((sub, i) => {
    const tableMatch = sub.body.match(/((?:^\|.+\|$\n?)+)/m);
    if (!tableMatch) return sub;

    const tableEnd = tableMatch.index! + tableMatch[0].length;
    const tablePart = sub.body.slice(0, tableEnd).trim();
    const afterTable = sub.body.slice(tableEnd).trim();

    if (/cross-chain/i.test(sub.title)) {
      return { ...sub, body: afterTable ? `${tablePart}\n\n${afterTable}` : tablePart };
    }

    if (/network health/i.test(sub.title) || i === subsections.length - 1) {
      if (afterTable) {
        editorial = editorial ? `${editorial}\n\n${afterTable}` : afterTable;
      }
      return { ...sub, body: tablePart };
    }

    return sub;
  });

  return { subsections: trimmed, editorial: cleanPrivacyIndexProse(editorial) };
}

function resolveProse(
  body: string,
  kind: SectionKind,
  subsections: ParsedSubsection[],
  tables: ParsedTable[],
  grantGroups: ParsedGrantGroup[]
): string {
  let prose = body;

  if (kind === 'tweets') prose = stripBlockquotes(prose);
  if (kind === 'whats-ahead') {
    prose = stripListItems(prose, /^[\-\*] \*\*.+?\*\* — .+$/gm);
    prose = stripTables(prose);
  }
  if (kind === 'tool-updates') {
    prose = stripListItems(prose, /^[\-\*] \*\*.+?\*\* — .+$/gm);
    prose = prose.replace(/^\*\*.+?\*\*:?\s*.+$/gm, '').trim();
  }

  if (subsections.length > 0) {
    if (
      kind === 'governance' ||
      kind === 'protocol' ||
      kind === 'top-stories' ||
      kind === 'ecosystem' ||
      kind === 'forum-highlights'
    ) {
      prose = getLeadingProse(body);
    } else if (kind === 'privacy-index') {
      prose = removeAllSubsections(
        body,
        subsections.map((s) => s.title)
      );
      prose = stripTables(prose);
      prose = cleanPrivacyIndexProse(prose);
    } else if (kind === 'tool-updates') {
      prose = getLeadingProse(body);
    }
  }

  if (kind === 'governance' && grantGroups.length > 0) {
    prose = getLeadingProse(body);
  }

  if (tables.length > 0 && kind === 'network-snapshot') {
    prose = stripTables(prose);
  }

  return prose.replace(/^---$/gm, '').trim();
}

export function parseNewsletterContent(content: string): ParsedSection[] {
  const footerMatch = content.match(/\n(\*Published by[\s\S]+)$/);
  const mainContent = footerMatch ? content.slice(0, footerMatch.index).trim() : content;

  const cleaned = mainContent
    .replace(/^\*Your weekly digest.*\*$/gm, '')
    .replace(/^\*Edition #\d+\*$/gm, '')
    .replace(/^# .+$/gm, '')
    .replace(/^---$/gm, '')
    .trim();

  const rawSections = cleaned.split(/^## /gm).filter(Boolean);

  return rawSections.map((raw) => {
    const newline = raw.indexOf('\n');
    const title = newline === -1 ? raw.trim() : raw.slice(0, newline).trim();
    let body = newline === -1 ? '' : raw.slice(newline + 1).trim();
    const { kind, privacyCornerTitle } = classifySection(title);

    if (kind === 'privacy-index') {
      body = normalizePrivacyIndexBody(body);
    }

    let subsections = resolveSubsections(body, kind);
    let privacyEditorial = '';

    if (kind === 'privacy-index' && subsections.length > 0) {
      const split = splitPrivacyIndexContent(subsections);
      subsections = split.subsections;
      privacyEditorial = split.editorial;
    }

    const tables = parseTables(body);
    const quotes = kind === 'tweets' ? parseQuotes(body) : [];
    let timeline = kind === 'whats-ahead' ? parseTimeline(body) : [];
    if (kind === 'whats-ahead' && timeline.length === 0) {
      timeline = parseTimelineFromTable(body);
    }
    const toolUpdates =
      kind === 'tool-updates' ? resolveToolUpdates(body, parseSubsections(body)) : [];
    const grantGroups = kind === 'governance' ? parseGrantGroups(body) : [];
    let prose = resolveProse(body, kind, subsections, tables, grantGroups);

    if (kind === 'privacy-index') {
      const intro = prose.match(/^\*Powered by[\s\S]*?\*\s*$/m)?.[0]?.trim() ?? '';
      prose = [intro, privacyEditorial].filter(Boolean).join('\n\n');
    }

    return {
      id: slugify(title),
      title,
      kind,
      privacyCornerTitle,
      body,
      subsections,
      tables,
      quotes,
      timeline,
      toolUpdates,
      grantGroups,
      prose,
    };
  });
}

export function parseNewsletterFooter(content: string): string {
  const footerMatch = content.match(/\n(\*Published by[\s\S]+)$/);
  return footerMatch ? footerMatch[1].trim() : '';
}

export function extractSections(md: string): { id: string; title: string }[] {
  const sections: { id: string; title: string }[] = [];
  const regex = /^## (.+)$/gm;
  let match;

  while ((match = regex.exec(md)) !== null) {
    const title = match[1].trim();
    sections.push({ id: slugify(title), title });
  }

  return sections;
}
