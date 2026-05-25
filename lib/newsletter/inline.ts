/** Inline markdown → HTML for newsletter prose (links, emphasis, code). */

export function inlineMarkdown(text: string): string {
  let html = text;

  html = html.replace(/`([^`]+)`/g, '<code class="nl-code">$1</code>');
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong class="text-primary font-semibold"><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="text-primary font-semibold">$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em class="text-secondary/90">$1</em>');
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="nl-link">$1</a>'
  );

  return html;
}

export function proseMarkdown(md: string): string {
  const blocks = md
    .replace(/^---$/gm, '')
    .split(/\n\n+/)
    .map((b) => b.trim())
    .filter(Boolean);

  return blocks
    .map((block) => {
      if (/^#### /.test(block)) {
        const title = block.replace(/^#### /, '');
        return `<h4 class="nl-h4">${inlineMarkdown(title)}</h4>`;
      }

      if (/^[\-\*] /.test(block)) {
        const items = block
          .split('\n')
          .filter((l) => /^[\-\*] /.test(l))
          .map((l) => `<li>${inlineMarkdown(l.replace(/^[\-\*] /, ''))}</li>`)
          .join('');
        return `<ul class="nl-list">${items}</ul>`;
      }

      if (/^\|.+\|$/.test(block)) {
        return renderTable(block);
      }

      return `<p class="nl-p">${inlineMarkdown(block.replace(/\n/g, '<br/>'))}</p>`;
    })
    .join('\n');
}

function renderTable(block: string): string {
  const rows = block.trim().split('\n').filter((r) => r.trim());
  if (rows.length < 2) return `<p class="nl-p">${inlineMarkdown(block)}</p>`;

  const parseRow = (row: string) => row.split('|').slice(1, -1).map((c) => c.trim());
  const isSeparator = (row: string) => /^\|[\s\-:|]+\|$/.test(row.trim());
  const headerCells = parseRow(rows[0]);
  const dataStart = isSeparator(rows[1]) ? 2 : 1;

  let html =
    '<div class="nl-table-wrap"><table class="nl-table"><thead><tr>';
  headerCells.forEach((cell) => {
    html += `<th>${inlineMarkdown(cell)}</th>`;
  });
  html += '</tr></thead><tbody>';

  for (let i = dataStart; i < rows.length; i++) {
    const cells = parseRow(rows[i]);
    html += `<tr>${cells.map((c) => `<td>${inlineMarkdown(c)}</td>`).join('')}</tr>`;
  }

  html += '</tbody></table></div>';
  return html;
}
