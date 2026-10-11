import coverage from './fontCoverage.json';
import type { Language } from '../types';

// react-pdf paints a character that none of the booklet's fonts has as a WRONG
// glyph (a Latin-looking "Ä" for the rare variant 叄), not as an empty box. So
// before the PDF is built every character the Chinese font chain can't draw is
// replaced: first by its other-script form (叄 -> 叁), then by a plain
// equivalent (℃ -> °C, é -> e), and finally dropped (emoji) or shown as "?".
// The coverage table comes from the font files: scripts/build-font-coverage.mjs.

type Converters = { toTrad: (s: string) => string; toSimp: (s: string) => string };

const SYMBOLS: Record<string, string> = { '℃': '°C', '℉': '°F', '→': '->', '←': '<-', '★': '*', '☆': '*', '♥': '♡', '❤': '♡', '✓': 'v', '✔': 'v', '×': 'x' };
const PICTOGRAPH = /\p{Extended_Pictographic}|️|‍/u;

const covered: Partial<Record<string, Set<number>>> = {};
function coveredSet(language: 'zh-Hant' | 'zh-Hans'): Set<number> {
  return (covered[language] ??= (() => {
    const set = new Set<number>();
    const ranges = (coverage as Record<string, number[]>)[language];
    for (let i = 0; i < ranges.length; i += 2) for (let c = ranges[i]; c <= ranges[i + 1]; c++) set.add(c);
    return set;
  })());
}

export function makeGlyphFixer(language: Language, converters: Converters): (text: string) => string {
  const set = coveredSet(language === 'zh-Hans' ? 'zh-Hans' : 'zh-Hant');
  const has = (s: string) => Array.from(s).every(ch => set.has(ch.codePointAt(0)!));
  const fixChar = (ch: string): string => {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x20 || cp === 0x0a || set.has(cp)) return ch; // control characters and newlines pass through
    if (PICTOGRAPH.test(ch)) return '';
    for (const alt of [converters.toTrad(ch), converters.toSimp(ch), SYMBOLS[ch], ch.normalize('NFD').replace(/[̀-ͯ]/g, '')]) {
      if (alt && alt !== ch && has(alt)) return alt;
    }
    return '?';
  };
  return text => Array.from(text).map(fixChar).join('');
}
