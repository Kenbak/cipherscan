/** Stable categorical hues. Labels remain the identifier when many series share a palette. */
export function categoryColor(name: string, theme: 'light'|'dark') {
  const palette = theme === 'dark'
    ? ['#F8BC21','#B6A0E0','#65C79A','#E2A66E','#A1A9AD','#91AC90','#CF91AF','#7EACCA','#C6B89B','#9CA4B0','#D58D86','#8C91C4']
    : ['#876000','#7040B5','#14734B','#A34A16','#526073','#426C45','#943F69','#276389','#756039','#59616D','#A33F39','#545798'];
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}
