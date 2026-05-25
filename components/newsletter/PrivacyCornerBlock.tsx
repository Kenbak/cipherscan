import { inlineMarkdown } from '@/lib/newsletter';
import { ProseHtml } from './ProseHtml';

interface PrivacyCornerBlockProps {
  title: string;
  body: string;
}

export function PrivacyCornerBlock({ title, body }: PrivacyCornerBlockProps) {
  return (
    <div className="nl-privacy-corner">
      <div className="nl-privacy-corner-header">
        <span className="nl-privacy-corner-badge">Privacy Corner</span>
        <h3
          className="nl-privacy-corner-title"
          dangerouslySetInnerHTML={{ __html: inlineMarkdown(title) }}
        />
      </div>
      <ProseHtml markdown={body} />
    </div>
  );
}
