// An ingredient list should read one ingredient per line. Older posts and some
// AI replies arrive as a single comma-separated run, e.g.
//   "250 g banana (about 2 medium), 200 g flour, 1/2 tsp salt"
// so when there are no line breaks, split at a comma or semicolon that is
// followed by a quantity (a digit or a vulgar fraction) and is not inside
// parentheses. A comma inside one ingredient ("2 tomatoes, diced") is left alone.
export function ingredientLines(text: string): string[] {
  const clean = (l: string) => l.replace(/^\s*[-•*]\s*/, '').trim();
  const lines = text.split(/\r?\n/).map(clean).filter(Boolean);
  if (lines.length > 1) return lines;

  const single = lines[0] || '';
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < single.length; i++) {
    const ch = single[i];
    if (ch === '(' || ch === '（') depth++;
    else if (ch === ')' || ch === '）') depth = Math.max(0, depth - 1);
    else if (depth === 0 && (ch === ',' || ch === ';' || ch === '；' || ch === '，')) {
      if (/^\s*[\d¼½¾⅓⅔⅛]/.test(single.slice(i + 1))) {
        out.push(single.slice(start, i));
        start = i + 1;
      }
    }
  }
  out.push(single.slice(start));
  return out.map(clean).filter(Boolean);
}
