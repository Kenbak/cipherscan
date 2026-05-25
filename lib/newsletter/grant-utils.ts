/** Strip grant status blocks, leaving trailing prose (e.g. CTA links). */

export function stripGrantGroupsFromBody(body: string): string {
  const labelRegex = /^\*\*(Approved:?|Under [Rr]eview:?|Declined[^*]*:?|New(?:ly [Ff]iled)?[^*]*:?)\*\*\s*$/gm;
  return body
    .replace(labelRegex, '')
    .replace(/^[\-\*] .+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
