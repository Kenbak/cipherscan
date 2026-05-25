import { proseMarkdown } from '@/lib/newsletter';

interface ProseHtmlProps {
  markdown: string;
  className?: string;
}

export function ProseHtml({ markdown, className = 'nl-prose' }: ProseHtmlProps) {
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: proseMarkdown(markdown) }}
    />
  );
}
