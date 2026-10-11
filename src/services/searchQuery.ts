// Browse's keyword search. Every word of the query must appear somewhere in a
// post's `search_text` (see db/schema.sql section 9) as a SUBSTRING, so 壽司
// finds 素食彩虹壽司 and "tom" finds "tomato". Chinese posts are stored in
// whichever script the author typed (and generated Chinese is Traditional), so
// each Chinese word is also tried in the other script: a reader searching 叉燒
// still finds a post written 叉烧.

const HAS_CJK = /[㐀-鿿豈-﫿]/;
const MAX_WORDS = 8;
const MAX_WORD_LENGTH = 60;

export function queryWords(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean).slice(0, MAX_WORDS).map(w => w.slice(0, MAX_WORD_LENGTH));
}

/** Escapes LIKE wildcards so a typed "%" or "_" is searched for literally. */
export function likeEscape(word: string): string {
  return word.replace(/[\\%_]/g, '\\$&');
}

// opencc-js is ~1 MB: only fetched when someone actually searches in Chinese.
let converters: Promise<{ toTrad: (s: string) => string; toSimp: (s: string) => string }> | null = null;
export function loadScriptConverters() {
  return (converters ??= Promise.all([import('opencc-js/cn2t'), import('opencc-js/t2cn')]).then(([a, b]) => ({
    toTrad: a.Converter({ from: 'cn', to: 't' }),
    toSimp: b.Converter({ from: 't', to: 'cn' }),
  })));
}

/** The spellings to try for one word: itself, plus the other Chinese script if it has Chinese in it. */
export async function wordVariants(word: string): Promise<string[]> {
  if (!HAS_CJK.test(word)) return [word];
  try {
    const { toTrad, toSimp } = await loadScriptConverters();
    return [...new Set([word, toTrad(word), toSimp(word)])];
  } catch {
    return [word];
  }
}

// A value inside PostgREST's or=(...) list must be double-quoted when it can
// contain commas, parentheses or quotes; inside the quotes only \ and " need escaping.
const orQuote = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** The or=(...) argument matching any variant of one word on `column`. */
export function variantsFilter(column: string, variants: string[]): string {
  return variants.map(v => `${column}.ilike.${orQuote(`%${likeEscape(v)}%`)}`).join(',');
}

/** For each word of the query, the spellings to try (async: may load the script converters). */
export async function keywordPlan(query: string): Promise<string[][]> {
  return Promise.all(queryWords(query).map(wordVariants));
}

// NOT async on purpose: a supabase query builder is a thenable, so returning it
// from an async function would run the query early.
/** Adds "every word matches (in any of its spellings)" to a supabase query builder. */
export function applyKeywords<Q extends { ilike: (c: string, p: string) => Q; or: (f: string) => Q }>(q: Q, column: string, plan: string[][]): Q {
  let out = q;
  for (const variants of plan) {
    out = variants.length === 1 ? out.ilike(column, `%${likeEscape(variants[0])}%`) : out.or(variantsFilter(column, variants));
  }
  return out;
}
