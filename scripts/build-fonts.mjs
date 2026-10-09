// Downloads the Noto Serif CJK subsets the booklet PDF uses (Fontsource ships
// them as zlib-compressed .woff) and writes them to public/fonts as plain
// uncompressed .ttf/.otf. react-pdf's font parser decompresses .woff in pure
// JavaScript, which took ~13 s per Chinese booklet; uncompressed it takes ~0.1 s.
// Fonts are SIL Open Font License 1.1 (see public/fonts/OFL.txt).
// Usage: node scripts/build-fonts.mjs   (the output is committed; run only to refresh)
import { mkdirSync, writeFileSync } from 'node:fs';
import zlib from 'node:zlib';

const FONTSOURCE = 'https://cdn.jsdelivr.net/npm/@fontsource';
// Keep in sync with CJK_FONTS in src/services/recipeBooklet.tsx.
const FILES = [
  ['noto-serif-sc', 'chinese-simplified'], ['noto-serif-sc', '119'], ['noto-serif-sc', '118'], ['noto-serif-sc', '117'], ['noto-serif-sc', '115'],
  ['noto-serif-tc', 'chinese-traditional'], ['noto-serif-tc', '122'], ['noto-serif-tc', '123'], ['noto-serif-tc', '119'],
];
const WEIGHTS = [400, 700];

function woffToSfnt(b) {
  const flavor = b.readUInt32BE(4);
  const n = b.readUInt16BE(12);
  const tabs = [];
  for (let i = 0; i < n; i++) {
    const o = 44 + i * 20;
    const tag = b.toString('latin1', o, o + 4);
    const off = b.readUInt32BE(o + 4), cl = b.readUInt32BE(o + 8), ol = b.readUInt32BE(o + 12), cs = b.readUInt32BE(o + 16);
    const raw = b.subarray(off, off + cl);
    tabs.push({ tag, cs, data: cl < ol ? zlib.inflateSync(raw) : raw });
  }
  tabs.sort((a, c) => (a.tag < c.tag ? -1 : 1));
  const dir = Buffer.alloc(12 + n * 16);
  let sr = 1, es = 0;
  while (sr * 2 <= n) { sr *= 2; es++; }
  dir.writeUInt32BE(flavor, 0); dir.writeUInt16BE(n, 4);
  dir.writeUInt16BE(sr * 16, 6); dir.writeUInt16BE(es, 8); dir.writeUInt16BE(n * 16 - sr * 16, 10);
  const parts = [dir];
  let p = dir.length;
  tabs.forEach((t, i) => {
    const o = 12 + i * 16;
    dir.write(t.tag, o, 'latin1'); dir.writeUInt32BE(t.cs, o + 4); dir.writeUInt32BE(p, o + 8); dir.writeUInt32BE(t.data.length, o + 12);
    const pad = (4 - (t.data.length % 4)) % 4;
    parts.push(t.data, Buffer.alloc(pad));
    p += t.data.length + pad;
  });
  return Buffer.concat(parts);
}

mkdirSync('public/fonts', { recursive: true });
for (const [pkg, subset] of FILES) {
  for (const w of WEIGHTS) {
    const name = `${pkg}-${subset}-${w}-normal`;
    const res = await fetch(`${FONTSOURCE}/${pkg}@5/files/${name}.woff`);
    if (!res.ok) throw new Error(`${name}: ${res.status}`);
    const sfnt = woffToSfnt(Buffer.from(await res.arrayBuffer()));
    const ext = sfnt.toString('latin1', 0, 4) === 'OTTO' ? 'otf' : 'ttf';
    writeFileSync(`public/fonts/${name}.${ext}`, sfnt);
    console.log(`${name}.${ext}  ${(sfnt.length / 1e3).toFixed(0)} KB`);
  }
}
