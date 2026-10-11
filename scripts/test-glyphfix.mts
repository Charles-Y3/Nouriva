// Tests for src/services/glyphFix.ts: characters the booklet's Chinese fonts can't draw are replaced
// (react-pdf would paint them as WRONG glyphs). Run: npm run test:glyphfix
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { makeGlyphFixer } from '../src/services/glyphFix.ts';
import coverage from '../src/services/fontCoverage.json' with { type: 'json' };

let passed = 0;
const failures: string[] = [];
async function test(name: string, fn: () => unknown | Promise<unknown>) {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e: any) { failures.push(name); console.log('  FAIL ' + name + '\n       ' + (e?.message || e)); }
}

const require = createRequire(import.meta.url);
const OpenCC = { cn2t: require('opencc-js/cn2t'), t2cn: require('opencc-js/t2cn') };
const converters = { toTrad: OpenCC.cn2t.Converter({ from: 'cn', to: 't' }), toSimp: OpenCC.t2cn.Converter({ from: 't', to: 'cn' }) };
const hant = makeGlyphFixer('zh-Hant', converters);
const hans = makeGlyphFixer('zh-Hans', converters);

await test('the case that printed "Ä": the rare variant 叄 becomes the drawable 叁', () => {
  assert.equal(hant('叄巴素蝦米'), '叁巴素蝦米');
  assert.equal(hans('叄巴'), '叁巴');
});
await test('text the fonts can draw is untouched (both scripts, Latin, digits, punctuation, newlines)', () => {
  const ok = '蜜汁叉燒 / 叉烧\nPrep 10 min · Cook 25 min · Serves 2，好吃！“Café” — 3.5 g (½)';
  assert.equal(hant(ok), ok);
  assert.equal(hans(ok), ok);
});
await test('symbols the fonts lack become plain equivalents', () => {
  assert.equal(hant('180℃'), '180°C');
  assert.equal(hant('A → B'), 'A -> B');
  assert.equal(hant('★ 好'), '* 好');
});
await test('emoji are dropped, an unknown character becomes "?", never garbage', () => {
  assert.equal(hant('好吃😊'), '好吃');
  assert.equal(hant('好吃👨‍🍳!'), '好吃!');
  assert.equal(hant('a\u{10FFFD}b'), 'a?b');
});
await test('empty and ASCII-only text pass through', () => { assert.equal(hant(''), ''); assert.equal(hant('plain text 123'), 'plain text 123'); });
await test('everything the fixer returns is drawable (property check over many characters)', () => {
  const set = new Set<number>();
  const r = (coverage as Record<string, number[]>)['zh-Hant'];
  for (let i = 0; i < r.length; i += 2) for (let c = r[i]; c <= r[i + 1]; c++) set.add(c);
  const sample = Array.from({ length: 3000 }, (_, i) => String.fromCodePoint(0x4e00 + i * 7)).join('') + '℃→★♥😊叄èüñ';
  for (const ch of Array.from(hant(sample))) assert.ok(ch === '\n' || set.has(ch.codePointAt(0)!), `undrawable ${JSON.stringify(ch)} (U+${ch.codePointAt(0)!.toString(16)})`);
});
await test('the coverage table matches the font files it was built from (rebuild it if the fonts change)', () => {
  const fontkit = require('fontkit');
  const files = ['noto-serif-tc-chinese-traditional', 'noto-serif-tc-122', 'noto-serif-tc-123', 'noto-serif-tc-119', 'noto-serif-sc-chinese-simplified'];
  const all = new Set<number>();
  for (const n of files) for (const c of fontkit.create(fs.readFileSync(`public/fonts/${n}-400-normal.ttf`)).characterSet) all.add(c);
  const fromTable = new Set<number>();
  const r = (coverage as Record<string, number[]>)['zh-Hant'];
  for (let i = 0; i < r.length; i += 2) for (let c = r[i]; c <= r[i + 1]; c++) fromTable.add(c);
  assert.equal(fromTable.size, all.size);
});

console.log(failures.length ? `\n${failures.length} FAILED, ${passed} passed` : `\nall ${passed} passed`);
process.exitCode = failures.length ? 1 : 0;
