import { longformMarkdown } from '@/lib/newsletter/longform';
import { LONGFORM_HTML_CLASSES } from '@/lib/newsletter/longform-classes';

interface LongformArticleProps {
  markdown: string;
}

export function LongformArticle({ markdown }: LongformArticleProps) {
  return (
    <article className="nl-longform">
      {/* Ensures Tailwind keeps CSS for classes only present in longform HTML strings */}
      <div className={LONGFORM_HTML_CLASSES} hidden aria-hidden />
      <div
        className="nl-longform-body nl-prose nl-prose--longform"
        dangerouslySetInnerHTML={{ __html: longformMarkdown(markdown) }}
      />
    </article>
  );
}
