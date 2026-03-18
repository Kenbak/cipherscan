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

/**
 * Convert markdown to simple HTML for newsletter rendering.
 * Handles: headings, paragraphs, bold, italic, links, lists, code blocks, blockquotes, hr.
 */
export function markdownToHtml(md: string): string {
  let html = md;

  // Code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) =>
    `<pre class="bg-cipher-bg rounded-lg p-4 overflow-x-auto text-sm font-mono text-secondary my-4"><code>${code.replace(/</g, '&lt;').replace(/>/g, '&gt;').trim()}</code></pre>`
  );

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="bg-cipher-bg rounded px-1.5 py-0.5 text-sm font-mono text-cipher-cyan">$1</code>');

  // Headings
  html = html.replace(/^#### (.+)$/gm, '<h4 class="text-base font-bold text-primary mt-6 mb-2 font-mono">$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-lg font-bold text-primary mt-8 mb-3 font-mono">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold text-primary mt-10 mb-4 font-mono">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold text-primary mt-10 mb-4 font-mono">$1</h1>');

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, '<blockquote class="border-l-2 border-cipher-cyan/40 pl-4 my-4 text-secondary italic">$1</blockquote>');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr class="border-cipher-border my-8" />');

  // Bold + italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong class="font-bold text-primary"><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold text-primary">$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em class="italic">$1</em>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-cipher-cyan hover:text-cipher-cyan-bright underline underline-offset-2">$1</a>');

  // Unordered lists
  html = html.replace(/^[\-\*] (.+)$/gm, '<li class="ml-4 text-secondary">$1</li>');
  html = html.replace(/((?:<li[^>]*>.*<\/li>\n?)+)/g, '<ul class="list-disc pl-4 my-4 space-y-1">$1</ul>');

  // Paragraphs (lines that aren't already HTML)
  html = html
    .split('\n\n')
    .map(block => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('<')) return trimmed;
      return `<p class="text-secondary leading-relaxed my-4">${trimmed.replace(/\n/g, '<br/>')}</p>`;
    })
    .join('\n');

  return html;
}
