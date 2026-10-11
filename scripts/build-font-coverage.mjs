// Writes src/services/fontCoverage.json: which characters the booklet's Chinese font chain can
// actually draw, per language. react-pdf paints a character no font has as a WRONG glyph
// (a Latin-looking "Ä" instead of 叄), not as an empty box, so src/services/glyphFix.ts
// replaces such characters before the PDF is built, using this table.
// Run after build-fonts.mjs (it reads public/fonts/*-400-normal.ttf): node scripts/build-font-coverage.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const fontkit = require('fontkit');
const dir = 'public/fonts/';
const set = name => new Set(fontkit.create(fs.readFileSync(`${dir}${name}-400-normal.ttf`)).characterSet);

// Keep in sync with CJK_FONTS in src/services/recipeBooklet.tsx (own faces, then the other script's main face).
const chains = {
  'zh-Hant': ['noto-serif-tc-chinese-traditional', 'noto-serif-tc-122', 'noto-serif-tc-123', 'noto-serif-tc-119', 'noto-serif-sc-chinese-simplified'],
  'zh-Hans': ['noto-serif-sc-chinese-simplified', 'noto-serif-sc-119', 'noto-serif-sc-118', 'noto-serif-sc-117', 'noto-serif-sc-115', 'noto-serif-tc-chinese-traditional'],
};

const out = {};
for (const [lang, names] of Object.entries(chains)) {
  const all = new Set();
  for (const n of names) for (const c of set(n)) all.add(c);
  const sorted = [...all].sort((a, b) => a - b);
  const ranges = []; // flat [start, end, start, end, ...]
  for (const c of sorted) {
    if (ranges.length && ranges[ranges.length - 1] === c - 1) ranges[ranges.length - 1] = c;
    else ranges.push(c, c);
  }
  out[lang] = ranges;
  console.log(lang, sorted.length, 'characters in', ranges.length / 2, 'ranges');
}
fs.writeFileSync('src/services/fontCoverage.json', JSON.stringify(out));
console.log('wrote src/services/fontCoverage.json', fs.statSync('src/services/fontCoverage.json').size, 'bytes');
