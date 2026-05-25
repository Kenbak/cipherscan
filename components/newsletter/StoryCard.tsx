import { extractFirstLink, inlineMarkdown } from '@/lib/newsletter';
import { ProseHtml } from './ProseHtml';

interface StoryCardProps {
  title: string;
  body: string;
  featured?: boolean;
}

export function StoryCard({ title, body, featured = false }: StoryCardProps) {
  const primaryLink = extractFirstLink(body);

  return (
    <article className={`nl-story-card ${featured ? 'nl-story-card--featured' : ''}`}>
      <h3
        className="nl-story-title"
        dangerouslySetInnerHTML={{ __html: inlineMarkdown(title) }}
      />
      <ProseHtml markdown={body} className="nl-prose nl-prose--compact" />
      {primaryLink && (
        <a
          href={primaryLink.url}
          target="_blank"
          rel="noopener noreferrer"
          className="nl-story-source"
        >
          {primaryLink.text}
          <span aria-hidden="true"> →</span>
        </a>
      )}
    </article>
  );
}
