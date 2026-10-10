// Tests for src/services/searchQuery.ts (Browse's keyword search). Run: npm run test:search
import assert from 'node:assert/strict';
import { applyKeywords, keywordPlan, likeEscape, queryWords, variantsFilter, wordVariants } from '../src/services/searchQuery.ts';

let passed = 0;
const failures: string[] = [];
async function test(name: string, fn: () => unknown | Promise<unknown>) {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e: any) { failures.push(name); console.log('  FAIL ' + name + '\n       ' + (e?.message || e)); }
}

// A recording stand-in for a supabase query builder.
function recorder() {
  const calls: string[] = [];
  const q: any = { ilike: (c: string, p: string) => (calls.push(`ilike ${c} ${p}`), q), or: (f: string) => (calls.push(`or ${f}`), q) };
  return { q, calls };
}

await test('splits into words, caps the count and the length', () => {
  assert.deepEqual(queryWords('  rainbow   sushi '), ['rainbow', 'sushi']);
  assert.equal(queryWords('a b c d e f g h i j k').length, 8);
  assert.equal(queryWords('x'.repeat(500))[0].length, 60);
  assert.deepEqual(queryWords('   '), []);
});
await test('LIKE wildcards are escaped so % and _ are searched literally', () => {
  assert.equal(likeEscape('50%_off\\'), '50\\%\\_off\\\\');
  assert.equal(likeEscape('plain'), 'plain');
});
await test('an English word has one spelling', async () => assert.deepEqual(await wordVariants('sushi'), ['sushi']));
await test('a Chinese word is also tried in the other script, both ways', async () => {
  const v = await wordVariants('叉燒');
  assert.ok(v.includes('叉燒') && v.includes('叉烧'), JSON.stringify(v));
  const w = await wordVariants('叉烧');
  assert.ok(w.includes('叉烧') && w.includes('叉燒'), JSON.stringify(w));
});
await test('a Chinese word with no script difference collapses to one spelling', async () => assert.deepEqual(await wordVariants('起司'), ['起司']));
await test('the or() filter quotes values, so commas, parentheses and quotes cannot break out', () => {
  const f = variantsFilter('search_text', ['a"b,c(d)', 'x']);
  assert.equal(f, 'search_text.ilike."%a\\"b,c(d)%",search_text.ilike."%x%"');
  // a literal backslash survives both levels of escaping: LIKE escape, then quoting
  assert.equal(variantsFilter('c', ['50%']), 'c.ilike."%50\\\\%%"');
});
await test('every word becomes its own condition (AND); single spellings use ilike, several use or()', async () => {
  const { q, calls } = recorder();
  applyKeywords(q, 'search_text', await keywordPlan('rainbow 叉燒'));
  assert.equal(calls.length, 2);
  assert.equal(calls[0], 'ilike search_text %rainbow%');
  assert.match(calls[1], /^or search_text\.ilike\."%叉燒%",search_text\.ilike\."%叉烧%"$/);
});
await test('a blank query adds no condition', async () => {
  const { q, calls } = recorder();
  applyKeywords(q, 'search_text', await keywordPlan('   '));
  assert.deepEqual(calls, []);
});
await test('applyKeywords is synchronous (a builder is a thenable: an async return would run the query early)', async () => {
  const { q } = recorder();
  const r = applyKeywords(q, 'c', []);
  assert.equal(typeof (r as any).then, 'undefined');
  assert.equal(r, q);
});

console.log(failures.length ? `\n${failures.length} FAILED, ${passed} passed` : `\nall ${passed} passed`);
process.exitCode = failures.length ? 1 : 0;
