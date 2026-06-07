import type { ParsedSection } from '@/lib/newsletter';
import { parseNewsletterContent, parseNewsletterFooter } from '@/lib/newsletter';
import { SectionShell } from './SectionShell';
import { StoryCard } from './StoryCard';
import { StatGrid } from './StatGrid';
import { PrivacyCornerBlock } from './PrivacyCornerBlock';
import { QuoteGrid } from './QuoteGrid';
import { GovernanceSection } from './GrantSection';
import { TimelineList, ToolUpdateList } from './TimelineList';
import { ProseHtml } from './ProseHtml';
import { PrivacyIndexSection } from './PrivacyIndexSection';
import { proseMarkdown } from '@/lib/newsletter';

interface NewsletterContentProps {
  content: string;
}

function renderSection(section: ParsedSection) {
  switch (section.kind) {
    case 'top-stories':
      if (section.subsections.length === 0 && section.prose) {
        return <ProseHtml markdown={section.prose} className="nl-prose nl-prose--longform" />;
      }
      return (
        <div className="nl-story-grid">
          {section.subsections.map((sub, i) => (
            <StoryCard key={i} title={sub.title} body={sub.body} featured={i === 0} />
          ))}
        </div>
      );

    case 'ecosystem':
      return (
        <div className="nl-ecosystem-grid">
          {section.subsections.map((sub, i) => (
            <StoryCard key={i} title={sub.title} body={sub.body} />
          ))}
        </div>
      );

    case 'forum-highlights':
      return (
        <div className="nl-ecosystem-grid">
          {section.subsections.map((sub, i) => (
            <StoryCard key={i} title={sub.title} body={sub.body} />
          ))}
        </div>
      );

    case 'governance':
      return (
        <GovernanceSection
          subsections={section.subsections}
          grantGroups={section.grantGroups}
          prose={section.prose}
        />
      );

    case 'protocol':
      return (
        <div className="nl-protocol">
          {section.subsections.map((sub, i) => (
            <StoryCard key={i} title={sub.title} body={sub.body} />
          ))}
          {section.prose && <ProseHtml markdown={section.prose} />}
        </div>
      );

    case 'tweets':
      return <QuoteGrid quotes={section.quotes} />;

    case 'privacy-corner':
      return (
        <PrivacyCornerBlock
          title={section.privacyCornerTitle || section.title}
          body={section.prose}
        />
      );

    case 'network-snapshot':
      return <StatGrid tables={section.tables} editorial={section.prose} />;

    case 'privacy-index':
      return <PrivacyIndexSection section={section} />;

    case 'tool-updates':
      return (
        <>
          <ToolUpdateList updates={section.toolUpdates} />
          {section.prose && <ProseHtml markdown={section.prose} />}
        </>
      );

    case 'whats-ahead':
      return (
        <>
          <TimelineList items={section.timeline} />
          {section.prose && <ProseHtml markdown={section.prose} />}
        </>
      );

    default:
      return (
        <>
          {section.subsections.map((sub, i) => (
            <StoryCard key={i} title={sub.title} body={sub.body} />
          ))}
          {section.prose && <ProseHtml markdown={section.prose} />}
        </>
      );
  }
}

function sectionLabel(section: ParsedSection): string {
  if (section.kind === 'privacy-corner') return 'Privacy Corner';
  if (section.kind === 'privacy-index') return 'Zcash Privacy Index';
  return section.title;
}

export function NewsletterContent({ content }: NewsletterContentProps) {
  const sections = parseNewsletterContent(content);
  const footer = parseNewsletterFooter(content);

  return (
    <div className="newsletter-content">
      {sections.map((section) => (
        <SectionShell
          key={section.id}
          id={section.id}
          label={sectionLabel(section)}
        >
          {renderSection(section)}
        </SectionShell>
      ))}

      {footer && (
        <footer
          className="nl-footer"
          dangerouslySetInnerHTML={{ __html: proseMarkdown(footer) }}
        />
      )}
    </div>
  );
}
