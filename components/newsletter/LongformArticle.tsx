import { longformMarkdown } from '@/lib/newsletter/longform';

interface LongformArticleProps {
  markdown: string;
}

export function LongformArticle({ markdown }: LongformArticleProps) {
  return (
    <article className="nl-longform">
      <div
        className="nl-longform-body nl-prose nl-prose--longform"
        dangerouslySetInnerHTML={{ __html: longformMarkdown(markdown) }}
      />
    </article>
  );
}
