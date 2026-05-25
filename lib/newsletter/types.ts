export interface NewsletterIssue {
  slug: string;
  title: string;
  summary: string;
  date: string;
  issue: number;
  content: string;
}

export interface NewsletterSectionMeta {
  id: string;
  title: string;
}

export type SectionKind =
  | 'top-stories'
  | 'ecosystem'
  | 'governance'
  | 'protocol'
  | 'tweets'
  | 'privacy-corner'
  | 'forum-highlights'
  | 'network-snapshot'
  | 'privacy-index'
  | 'tool-updates'
  | 'whats-ahead'
  | 'generic';

export interface ParsedSubsection {
  title: string;
  body: string;
}

export interface ParsedTable {
  headers: string[];
  rows: string[][];
}

export interface ParsedQuote {
  text: string;
  attribution: string;
}

export interface ParsedTimelineItem {
  date: string;
  event: string;
}

export interface ParsedToolUpdate {
  name: string;
  description: string;
}

export interface ParsedGrantGroup {
  label: string;
  variant: 'approved' | 'review' | 'declined' | 'new' | 'neutral';
  items: string[];
}

export interface ParsedSection {
  id: string;
  title: string;
  kind: SectionKind;
  privacyCornerTitle?: string;
  body: string;
  subsections: ParsedSubsection[];
  tables: ParsedTable[];
  quotes: ParsedQuote[];
  timeline: ParsedTimelineItem[];
  toolUpdates: ParsedToolUpdate[];
  grantGroups: ParsedGrantGroup[];
  prose: string;
}
