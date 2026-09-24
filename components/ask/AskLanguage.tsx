'use client';
import type { AskLocale } from '@/lib/ask/chat';
const choices: [AskLocale, string][] = [['auto', 'Auto · your language'], ['en', 'English'], ['fr', 'Français'], ['es', 'Español'], ['de', 'Deutsch'], ['pt', 'Português'], ['ja', '日本語'], ['zh', '中文'], ['ko', '한국어'], ['ar', 'العربية'], ['ru', 'Русский']];
export function AskLanguage({ value, onChange }: { value: AskLocale; onChange: (value: AskLocale) => void }) {
  return <label className="text-caption text-muted"><span className="sr-only">Answer language</span><select aria-label="Answer language" value={value} onChange={event => onChange(event.target.value as AskLocale)} className="max-w-full rounded border border-cipher-border bg-cipher-surface px-2 py-1 text-secondary">{choices.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>;
}
