// Which language a piece of typed text is in, for the two reading languages the
// app has (English / Chinese). A plain character count, no model: Chinese when
// Chinese characters are a meaningful share of the letters, so one Chinese dish
// name inside an English recipe stays English. The server uses the same rule to
// decide the translation direction (api/_translate.ts textLang); the two are
// kept identical by a test in scripts/test-translate.mts.
export type TextLang = 'en' | 'zh';

const CJK = /[㐀-鿿豈-﫿]/g;
const LATIN = /[A-Za-z]/g;

export function textLang(text: string): TextLang {
  const cjk = text.match(CJK)?.length ?? 0;
  if (cjk === 0) return 'en';
  const latin = text.match(LATIN)?.length ?? 0;
  return cjk / (cjk + latin) >= 0.15 ? 'zh' : 'en';
}
