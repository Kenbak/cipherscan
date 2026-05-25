import { inlineMarkdown } from '@/lib/newsletter';
import { ProseHtml } from './ProseHtml';

interface StoryCardProps {
  title: string;
  body: string;
  featured?: boolean;
}

export function StoryCard({ title, body, featured = false }: StoryCardProps) {
  return (
    <article className={`nl-story-card ${featured ? 'nl-story-card--featured' : ''}`}>
      <h3
        className="nl-story-title"
        dangerouslySetInnerHTML={{ __html: inlineMarkdown(title) }}
      />
      <ProseHtml markdown={body} className="nl-prose nl-prose--compact" />
    </article>
  );
}
