import type { ParsedSection } from '@/lib/newsletter';
import { parseMarkdownTableBlock } from '@/lib/newsletter';
import { inlineMarkdown } from '@/lib/newsletter';
import { ProseHtml } from './ProseHtml';
import { StatGrid } from './StatGrid';

export function PrivacyIndexSection({ section }: { section: ParsedSection }) {
  const proseParts = section.prose.split(/\n\n+/).filter(Boolean);
  const intro = proseParts.find((p) => /powered by/i.test(p)) ?? '';
  const editorial = proseParts.filter((p) => p !== intro).join('\n\n');

  return (
    <div className="nl-privacy-index">
      {intro && (
        <p
          className="nl-powered-by"
          dangerouslySetInnerHTML={{ __html: inlineMarkdown(intro.replace(/^\*|\*$/g, '')) }}
        />
      )}
      {section.tables.length > 0 && <StatGrid tables={[section.tables[0]]} />}
      {section.subsections.map((sub, i) => {
        const tableMatch = sub.body.match(/((?:^\|.+\|$\n?)+)/m);
        const table = tableMatch ? parseMarkdownTableBlock(tableMatch[0]) : null;
        const subProse = tableMatch ? sub.body.replace(tableMatch[0], '').trim() : sub.body;

        return (
          <div key={i} className="nl-privacy-index-group">
            <h4 className="nl-subsection-title">{sub.title}</h4>
            {table && table.rows.length > 0 && <StatGrid tables={[table]} />}
            {subProse && !subProse.startsWith('|') && (
              <ProseHtml markdown={subProse} className="nl-prose nl-prose--compact" />
            )}
          </div>
        );
      })}
      {editorial && (
        <div className="nl-editorial">
          <ProseHtml markdown={editorial} className="nl-prose nl-prose--compact" />
        </div>
      )}
    </div>
  );
}
