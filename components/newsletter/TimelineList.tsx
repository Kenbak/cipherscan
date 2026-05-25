import type { ParsedTimelineItem, ParsedToolUpdate } from '@/lib/newsletter';
import { inlineMarkdown } from '@/lib/newsletter';

interface TimelineListProps {
  items: ParsedTimelineItem[];
}

export function TimelineList({ items }: TimelineListProps) {
  return (
    <ol className="nl-timeline">
      {items.map((item, i) => (
        <li key={i} className="nl-timeline-item">
          <time className="nl-timeline-date">{item.date}</time>
          <span
            className="nl-timeline-event"
            dangerouslySetInnerHTML={{ __html: inlineMarkdown(item.event) }}
          />
        </li>
      ))}
    </ol>
  );
}

interface ToolUpdateListProps {
  updates: ParsedToolUpdate[];
}

export function ToolUpdateList({ updates }: ToolUpdateListProps) {
  return (
    <div className="nl-tool-updates">
      {updates.map((update, i) => (
        <div key={i} className="nl-tool-update">
          <p className="nl-tool-name">{update.name}</p>
          <p
            className="nl-tool-desc"
            dangerouslySetInnerHTML={{ __html: inlineMarkdown(update.description) }}
          />
        </div>
      ))}
    </div>
  );
}
