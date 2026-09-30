// Merges the hand-written story sources (English + Traditional Chinese) in
// src/data/stories-src/ and derives Simplified Chinese from the Traditional
// text with OpenCC, writing src/data/stories.json (the file the app imports).
// Run after editing any source file:  npm run build:stories
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as OpenCC from 'opencc-js';

const SRC = 'src/data/stories-src';
const TAGS = ['Gratitude', 'Peace', 'Joy', 'Compassion', 'Connection', 'Awareness', 'Contentment', 'Inspiration'];
const toHans = OpenCC.Converter({ from: 'tw', to: 'cn' });

const stories = readdirSync(SRC)
  .filter(f => f.endsWith('.json'))
  .sort()
  .flatMap(f => JSON.parse(readFileSync(join(SRC, f), 'utf8')));

stories.sort((a, b) => a.week - b.week);

stories.forEach((s, i) => {
  if (s.week !== i + 1) throw new Error(`Expected week ${i + 1}, found ${s.week}`);
  if (!TAGS.includes(s.tag)) throw new Error(`Week ${s.week}: unknown tag ${s.tag}`);
  if (!['traditional', 'original'].includes(s.source)) throw new Error(`Week ${s.week}: bad source`);
  for (const lang of ['en', 'zh-Hant']) {
    const t = s[lang];
    if (!t?.title || !t?.body || !Array.isArray(t.questions) || t.questions.length < 2) {
      throw new Error(`Week ${s.week}: incomplete ${lang}`);
    }
  }
  s['zh-Hans'] = {
    title: toHans(s['zh-Hant'].title),
    body: toHans(s['zh-Hant'].body),
    questions: s['zh-Hant'].questions.map(toHans),
  };
});

if (stories.length !== 52) throw new Error(`Expected 52 stories, found ${stories.length}`);
writeFileSync('src/data/stories.json', JSON.stringify(stories, null, 1) + '\n');
const byTag = {};
stories.forEach(s => (byTag[s.tag] = (byTag[s.tag] || 0) + 1));
console.log('Wrote src/data/stories.json —', stories.length, 'stories', byTag);
