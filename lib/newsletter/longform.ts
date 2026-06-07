import { inlineMarkdown } from './inline';

function splitBlocks(md: string): string[] {
  return md
    .replace(/^---$/gm, '')
    .split(/\n\n+/)
    .map((b) => b.trim())
    .filter(Boolean);
}

function isTimelineBlock(block: string): boolean {
  return /^\*\*[^*]+:\*\*\s/.test(block);
}

function parseTimelineBlock(block: string): { date: string; body: string } {
  const match = block.match(/^\*\*(.+?):\*\*\s([\s\S]*)$/);
  if (!match) return { date: '', body: block };
  return { date: match[1], body: match[2] };
}

function isStatList(block: string): boolean {
  if (!/^[\-\*] /.test(block)) return false;
  const items = block.split('\n').filter((l) => /^[\-\*] /.test(l));
  return items.length >= 2 && items.every((l) => /\*\*\d/.test(l));
}

function statAccent(desc: string): string {
  const lower = desc.toLowerCase();
  if (lower.includes('transparent') || lower.includes('still')) return 'held';
  if (lower.includes('reshield')) return 'reshielded';
  if (lower.includes('bridge') || lower.includes('cross-chain')) return 'bridge';
  if (lower.includes('exchange')) return 'exchange';
  if (lower.includes('transfer')) return 'transferred';
  return 'default';
}

function parseStatListItem(line: string): { pct: string; amount: string; desc: string } | null {
  const content = line.replace(/^[\-\*] /, '');
  const match = content.match(/^\*\*(.+?)\*\*\s*[—–\-]\s*(.+)$/);
  if (!match) return null;

  const label = match[1];
  const desc = match[2];
  const pctMatch = label.match(/^(.+?)\s*\((.+?)\)$/);
  if (pctMatch) {
    return { pct: pctMatch[1], amount: pctMatch[2], desc };
  }
  return { pct: label, amount: '', desc };
}

function isInlineAttributionQuote(block: string): boolean {
  return /^[^*\n]+:\s*\*".+"\*$/.test(block.trim());
}

function renderInlineAttributionQuote(block: string): string {
  const match = block.trim().match(/^(.+?):\s*\*(.+)\*$/);
  if (!match) return renderParagraph(block, 'nl-p');
  return renderPullQuote(match[2], match[1]);
}

function isAttributionLine(block: string): boolean {
  return (
    !block.includes('\n') &&
    block.length < 80 &&
    block.endsWith(':') &&
    !block.startsWith('**') &&
    !block.startsWith('>')
  );
}

function isCallout(block: string): boolean {
  return /^\*\*[^*]*\d/.test(block);
}

function isRecoveryCallout(block: string): boolean {
  return /shielded during the same period/i.test(block);
}

function renderTimelineItem(date: string, body: string): string {
  return `<div class="nl-longform-timeline-item">
    <time class="nl-longform-timeline-date">${inlineMarkdown(date)}</time>
    <p class="nl-longform-timeline-body">${inlineMarkdown(body)}</p>
  </div>`;
}

function renderPullQuote(quote: string, attribution: string): string {
  return `<figure class="nl-pullquote">
    <blockquote class="nl-blockquote">${inlineMarkdown(quote)}</blockquote>
    <figcaption class="nl-pullquote-attr">${inlineMarkdown(attribution)}</figcaption>
  </figure>`;
}

function renderStatBreakdown(block: string): string {
  const items = block
    .split('\n')
    .filter((l) => /^[\-\*] /.test(l))
    .map(parseStatListItem)
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const cards = items
    .map((item) => {
      const accent = statAccent(item.desc);
      return `<div class="nl-stat-breakdown-item nl-stat-breakdown-item--${accent}">
        <div class="nl-stat-breakdown-head">
          <span class="nl-stat-breakdown-pct">${inlineMarkdown(item.pct)}</span>
          ${item.amount ? `<span class="nl-stat-breakdown-amt">${inlineMarkdown(item.amount)}</span>` : ''}
        </div>
        <p class="nl-stat-breakdown-desc">${inlineMarkdown(item.desc)}</p>
      </div>`;
    })
    .join('');

  return `<div class="nl-stat-breakdown">${cards}</div>`;
}

function renderList(block: string): string {
  const items = block
    .split('\n')
    .filter((l) => /^[\-\*] /.test(l))
    .map((l) => `<li>${inlineMarkdown(l.replace(/^[\-\*] /, ''))}</li>`)
    .join('');
  return `<ul class="nl-list">${items}</ul>`;
}

function renderBlockquote(block: string): string {
  const inner = block
    .split('\n')
    .map((l) => l.replace(/^> ?/, ''))
    .join('<br/>');
  return `<blockquote class="nl-blockquote">${inlineMarkdown(inner)}</blockquote>`;
}

function renderParagraph(block: string, className: string): string {
  return `<p class="${className}">${inlineMarkdown(block.replace(/\n/g, '<br/>'))}</p>`;
}

export function longformMarkdown(md: string): string {
  const blocks = splitBlocks(md);
  const html: string[] = [];
  let i = 0;
  let isFirstParagraph = true;

  while (i < blocks.length) {
    const block = blocks[i];

    if (isInlineAttributionQuote(block)) {
      html.push(renderInlineAttributionQuote(block));
      i++;
      continue;
    }

    if (isAttributionLine(block) && i + 1 < blocks.length && /^> /.test(blocks[i + 1])) {
      const attribution = block.replace(/:$/, '');
      const quote = blocks[i + 1]
        .split('\n')
        .map((l) => l.replace(/^> ?/, ''))
        .join('<br/>');
      html.push(renderPullQuote(quote, attribution));
      i += 2;
      continue;
    }

    if (isTimelineBlock(block)) {
      const timelineItems: string[] = [];
      while (i < blocks.length && isTimelineBlock(blocks[i])) {
        const { date, body } = parseTimelineBlock(blocks[i]);
        timelineItems.push(renderTimelineItem(date, body));
        i++;
      }
      html.push(`<div class="nl-longform-timeline">${timelineItems.join('')}</div>`);
      continue;
    }

    if (isStatList(block)) {
      html.push(renderStatBreakdown(block));
      i++;
      continue;
    }

    if (/^#### /.test(block)) {
      html.push(
        `<h4 class="nl-h4 nl-longform-heading">${inlineMarkdown(block.replace(/^#### /, ''))}</h4>`
      );
      i++;
      continue;
    }

    if (/^> /.test(block)) {
      html.push(renderBlockquote(block));
      i++;
      continue;
    }

    if (/^[\-\*] /.test(block)) {
      html.push(renderList(block));
      i++;
      continue;
    }

    if (/^\*.+\*$/.test(block) && !block.includes('\n')) {
      const inner = block.replace(/^\*|\*$/g, '');
      html.push(`<p class="nl-attribution">${inlineMarkdown(inner)}</p>`);
      i++;
      continue;
    }

    if (isRecoveryCallout(block)) {
      html.push(`<div class="nl-callout nl-callout--recovery">${inlineMarkdown(block.replace(/\n/g, '<br/>'))}</div>`);
      i++;
      continue;
    }

    if (isCallout(block)) {
      html.push(`<div class="nl-callout">${inlineMarkdown(block.replace(/\n/g, '<br/>'))}</div>`);
      i++;
      continue;
    }

    if (isFirstParagraph) {
      html.push(renderParagraph(block, 'nl-p nl-lead'));
      isFirstParagraph = false;
    } else {
      html.push(renderParagraph(block, 'nl-p'));
    }
    i++;
  }

  return html.join('\n');
}
