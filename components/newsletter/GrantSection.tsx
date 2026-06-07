import type { ParsedGrantGroup, ParsedSubsection } from '@/lib/newsletter';
import { inlineMarkdown } from '@/lib/newsletter';
import { stripGrantGroupsFromBody } from '@/lib/newsletter/grant-utils';
import { ProseHtml } from './ProseHtml';
import { StoryCard } from './StoryCard';

interface GrantPipelineProps {
  groups: ParsedGrantGroup[];
  footer?: string;
}

const variantStyles: Record<ParsedGrantGroup['variant'], string> = {
  approved: 'nl-grant-label--approved',
  review: 'nl-grant-label--review',
  declined: 'nl-grant-label--declined',
  new: 'nl-grant-label--new',
  neutral: 'nl-grant-label--neutral',
};

export function GrantPipeline({ groups, footer }: GrantPipelineProps) {
  if (groups.length === 0 && !footer) return null;

  return (
    <div className="nl-grant-pipeline">
      {groups.map((group, i) => (
        <div key={i} className="nl-grant-group">
          <p className={`nl-grant-label ${variantStyles[group.variant]}`}>{group.label}</p>
          <ul className="nl-grant-list">
            {group.items.map((item, j) => (
              <li
                key={j}
                dangerouslySetInnerHTML={{ __html: inlineMarkdown(item) }}
              />
            ))}
          </ul>
        </div>
      ))}
      {footer && (
        <p
          className="nl-grant-footer"
          dangerouslySetInnerHTML={{ __html: inlineMarkdown(footer) }}
        />
      )}
    </div>
  );
}

interface GovernanceSectionProps {
  subsections: ParsedSubsection[];
  grantGroups: ParsedGrantGroup[];
  prose: string;
}

export function GovernanceSection({ subsections, grantGroups, prose }: GovernanceSectionProps) {
  const grantPipelineSub = subsections.find((sub) => /grant pipeline/i.test(sub.title));
  const grantFooter = grantPipelineSub
    ? stripGrantGroupsFromBody(grantPipelineSub.body)
    : '';

  return (
    <div className="nl-governance">
      {subsections
        .filter(
          (sub) =>
            !/grant pipeline/i.test(sub.title) &&
            !/^grant decisions$/i.test(sub.title) &&
            !/grant tracker/i.test(sub.title)
        )
        .map((sub, i) => (
          <StoryCard key={i} title={sub.title} body={sub.body} />
        ))}
      <GrantPipeline groups={grantGroups} footer={grantFooter} />
      {prose && <ProseHtml markdown={prose} />}
    </div>
  );
}
