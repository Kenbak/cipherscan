// Source guard complements the browser check: inheritance and relative units
// still require computed-style verification.
export function undersizedCssFonts(source) {
  const issues = [];
  for (const match of source.matchAll(/\b(font-size|font)\s*:\s*([^;}]+)/g)) {
    const size = match[2].match(/(?:^|\s)(\d*\.?\d+)(px|rem)\b/);
    if (!size) continue;
    const pixels = Number(size[1]) * (size[2] === 'rem' ? 16 : 1);
    if (pixels > 0 && pixels < 12) issues.push({ index: match.index, value: match[0] });
  }
  return issues;
}
