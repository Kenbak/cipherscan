import type { ParsedQuote } from '@/lib/newsletter';
import { inlineMarkdown } from '@/lib/newsletter';

interface QuoteGridProps {
  quotes: ParsedQuote[];
}

export function QuoteGrid({ quotes }: QuoteGridProps) {
  return (
    <div className="nl-quote-grid">
      {quotes.map((quote, i) => (
        <blockquote key={i} className="nl-quote-card">
          <p
            className="nl-quote-text"
            dangerouslySetInnerHTML={{ __html: inlineMarkdown(quote.text) }}
          />
          {quote.attribution && (
            <footer
              className="nl-quote-attribution"
              dangerouslySetInnerHTML={{ __html: inlineMarkdown(`— ${quote.attribution}`) }}
            />
          )}
        </blockquote>
      ))}
    </div>
  );
}
