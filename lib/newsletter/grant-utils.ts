/** Strip grant status blocks, leaving trailing prose (e.g. CTA links). */

const ZCG_ISSUE_BASE = 'https://github.com/ZcashCommunityGrants/zcashcommunitygrants/issues';

/** Turn `#312 — Title` (optionally bold) into a markdown link if not already linked. */
export function linkifyGrantItem(item: string): string {
  if (/\]\(https?:\/\//.test(item)) return item;

  const bare = item.replace(/^\*\*(.+)\*\*$/, '$1').trim();
  const match = bare.match(/^#(\d+)\s*(—|–|-)\s*(.+)$/);
  if (!match) return item;

  const [, id, sep, title] = match;
  return `[#${id} ${sep} ${title}](${ZCG_ISSUE_BASE}/${id})`;
}

export function stripGrantGroupsFromBody(body: string): string {
  const labelRegex = /^\*\*(Approved:?|Under [Rr]eview:?|Declined[^*]*:?|New(?:ly [Ff]iled)?[^*]*:?)\*\*\s*$/gm;
  return body
    .replace(labelRegex, '')
    .replace(/^[\-\*] .+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
