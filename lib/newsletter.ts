import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

export interface NewsletterIssue {
  slug: string;
  title: string;
  summary: string;
  date: string;
  issue: number;
  content: string;
}

export interface NewsletterSection {
  id: string;
  title: string;
}

const NEWSLETTER_DIR = path.join(process.cwd(), 'content', 'newsletter');

export function getAllNewsletters(): NewsletterIssue[] {
  if (!fs.existsSync(NEWSLETTER_DIR)) return [];

  const files = fs.readdirSync(NEWSLETTER_DIR).filter(f => f.endsWith('.md'));

  return files
    .map((file) => {
      const slug = file.replace('.md', '');
      const raw = fs.readFileSync(path.join(NEWSLETTER_DIR, file), 'utf8');
      const { data, content } = matter(raw);

      return {
        slug,
        title: data.title || `Issue ${slug}`,
        summary: data.summary || '',
        date: data.date ? String(data.date) : slug,
        issue: data.issue || 0,
        content,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function getNewsletter(slug: string): NewsletterIssue | null {
  const filePath = path.join(NEWSLETTER_DIR, `${slug}.md`);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, 'utf8');
  const { data, content } = matter(raw);

  return {
    slug,
    title: data.title || `Issue ${slug}`,
    summary: data.summary || '',
    date: data.date ? String(data.date) : slug,
    issue: data.issue || 0,
    content,
  };
}

export function extractSections(md: string): NewsletterSection[] {
  const sections: NewsletterSection[] = [];
  const regex = /^## (.+)$/gm;
  let match;
  while ((match = regex.exec(md)) !== null) {
    const title = match[1].trim();
    const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    sections.push({ id, title });
  }
  return sections;
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function markdownToHtml(md: string): string {
  let html = md;

  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) =>
    `<pre class="bg-[var(--color-surface)] rounded-xl p-5 overflow-x-auto text-sm font-mono text-secondary my-6 border border-cipher-border/30"><code>${code.replace(/</g, '&lt;').replace(/>/g, '&gt;').trim()}</code></pre>`
  );

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="bg-[var(--color-hover)] rounded px-1.5 py-0.5 text-[13px] font-mono text-cipher-yellow border border-cipher-border/30">$1</code>');

  // Headings — h2 gets section wrapper with anchor
  html = html.replace(/^#### (.+)$/gm, '<h4 class="text-base font-semibold text-primary mt-8 mb-3 font-mono">$1</h4>');
  html = html.replace(/^### (.+)$/gm, (_m, title) =>
    `<h3 class="text-[17px] font-semibold text-primary mt-10 mb-4 font-mono flex items-center gap-2"><span class="w-1 h-1 rounded-full bg-cipher-yellow/60 flex-shrink-0"></span>${title}</h3>`
  );
  html = html.replace(/^## (.+)$/gm, (_m, title) => {
    const id = slugify(title);
    return `<h2 id="${id}" class="text-xl font-bold text-primary mt-16 mb-6 font-mono flex items-center gap-3 scroll-mt-24 first:mt-0"><span class="text-cipher-yellow/50 text-sm font-normal">//</span>${title}</h2>`;
  });
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold text-primary mt-12 mb-6 font-mono">$1</h1>');

  // Multi-line blockquotes — group consecutive > lines into a single card
  html = html.replace(/((?:^> .+\n?)+)/gm, (block) => {
    const lines = block.split('\n').filter(l => l.startsWith('> ')).map(l => l.slice(2));
    const text = lines.join('\n');

    const attrMatch = text.match(/^(.+)\n— (.+)$/s);
    if (attrMatch) {
      const quote = attrMatch[1].trim();
      const attribution = attrMatch[2].trim();
      return `<blockquote class="bg-[var(--color-surface)] border border-cipher-border/30 rounded-xl p-6 my-6"><p class="text-secondary italic leading-relaxed text-[15px]">${quote}</p><footer class="mt-3 text-sm text-muted font-mono">— ${attribution}</footer></blockquote>`;
    }

    return `<blockquote class="border-l-2 border-cipher-yellow/40 pl-5 my-6"><p class="text-secondary italic leading-relaxed">${text.replace(/\n/g, '<br/>')}</p></blockquote>`;
  });

  // Horizontal rules — section dividers with generous breathing room
  html = html.replace(/^---$/gm, '<div style="padding:3rem 0"><hr class="border-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" /></div>');

  // Tables — card-style containers
  html = html.replace(/((?:^\|.+\|$\n?)+)/gm, (_match) => {
    const rows = _match.trim().split('\n').filter(r => r.trim());
    if (rows.length < 2) return _match;

    const parseRow = (row: string) =>
      row.split('|').slice(1, -1).map(c => c.trim());

    const headerCells = parseRow(rows[0]);
    const isSeparator = (row: string) => /^\|[\s\-:|]+\|$/.test(row.trim());
    const dataStart = isSeparator(rows[1]) ? 2 : 1;

    let table = '<div class="overflow-x-auto my-6 rounded-xl border border-white/[0.04] bg-white/[0.02]"><table class="w-full text-sm border-collapse">';
    table += '<thead><tr>';
    headerCells.forEach(cell => {
      table += `<th class="text-left text-[10px] font-mono text-cipher-yellow/50 uppercase tracking-widest px-5 py-3 border-b border-white/[0.04]">${cell}</th>`;
    });
    table += '</tr></thead><tbody>';

    for (let i = dataStart; i < rows.length; i++) {
      const cells = parseRow(rows[i]);
      const isEven = (i - dataStart) % 2 === 1;
      table += `<tr class="${isEven ? 'bg-white/[0.015]' : ''}">`;
      cells.forEach(cell => {
        table += `<td class="px-5 py-2.5 text-secondary">${cell}</td>`;
      });
      table += '</tr>';
    }

    table += '</tbody></table></div>';
    return table;
  });

  // Bold + italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong class="font-bold text-primary"><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-primary">$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em class="italic text-secondary/80">$1</em>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-cipher-cyan hover:text-cipher-cyan-bright underline decoration-cipher-cyan/30 hover:decoration-cipher-cyan underline-offset-2 transition-colors">$1</a>');

  // Unordered lists
  html = html.replace(/^[\-\*] (.+)$/gm, '<li class="text-secondary pl-1">$1</li>');
  html = html.replace(/((?:<li[^>]*>.*<\/li>\n?)+)/g, '<ul class="list-none pl-0 my-4 space-y-2 nl-list">$1</ul>');

  // Paragraphs
  html = html
    .split('\n\n')
    .map(block => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('<')) return trimmed;
      return `<p class="text-secondary leading-[1.75] my-4">${trimmed.replace(/\n/g, '<br/>')}</p>`;
    })
    .join('\n');

  return html;
}
