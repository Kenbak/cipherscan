import type { AskSource } from '@/lib/ask/chat';
export function AskSources({ sources }: { sources: AskSource[] }) {
  return sources.length ? <ul aria-label="Answer sources" className="mt-3 flex flex-wrap gap-2">{sources.map(source => <li key={source.id}><a href={source.url} rel="noopener noreferrer" target={source.url.startsWith('https://') ? '_blank' : undefined} title={`Reviewed ${source.reviewed}`} className="inline-block rounded border border-cipher-border px-2 py-1 text-caption text-cipher-gold hover:underline">{source.title} ↗</a></li>)}</ul> : null;
}
