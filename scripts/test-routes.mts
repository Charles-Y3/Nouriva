// Route-level tests for the language-version features in api/_app.ts, run against an
// in-memory database and a fake AI provider (no network, no real database).
// Run: npm run test:routes
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createApiApp } from '../api/_app.ts';

let passed = 0;
const failures: string[] = [];
async function test(name: string, fn: () => unknown | Promise<unknown>) {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e: any) { failures.push(name); console.log('  FAIL ' + name + '\n       ' + (e?.stack?.split('\n').slice(0, 3).join('\n       ') || e)); }
}

// --- in-memory stand-in for the supabase-js calls api/_app.ts and api/_translate.ts make ---
type Row = Record<string, any>;
function makeDb() {
  const tables: Record<string, Row[]> = { posts: [], translation_state: [{ id: 1, paused_until: null, pause_notified: false }] };
  class Q {
    filters: ((r: Row) => boolean)[] = []; op: 'select' | 'update' = 'select'; patch: Row = {}; wantRows = false; head = false; countMode = false; lim = Infinity;
    constructor(public table: string) {}
    select(_cols?: string, o?: { count?: string; head?: boolean }) { this.wantRows = true; if (o?.count) this.countMode = true; if (o?.head) this.head = true; return this; }
    update(patch: Row) { this.op = 'update'; this.patch = patch; return this; }
    eq(k: string, v: any) { this.filters.push(r => r[k] === v); return this; }
    is(k: string, v: any) { this.filters.push(r => (r[k] ?? null) === v); return this; }
    in(k: string, vs: any[]) { this.filters.push(r => vs.includes(r[k])); return this; }
    lt(k: string, v: any) { this.filters.push(r => r[k] < v); return this; }
    // Understands the one shape supabaseStore() sends: "<col>.in.(a,b),and(<col>.eq.x,<col2>.lt.<iso>)".
    or(expr: string) {
      const m = expr.match(/^(\w+)\.in\.\(([^)]*)\),and\((\w+)\.eq\.(\w+),(\w+)\.lt\.(.+)\)$/);
      if (!m) throw new Error('fake db: unsupported or() filter: ' + expr);
      const [, col, list, col2, val, tcol, iso] = m;
      const set = list.split(',');
      this.filters.push(r => set.includes(r[col]) || (r[col2] === val && r[tcol] != null && r[tcol] < iso));
      return this;
    }
    order() { return this; }
    limit(n: number) { this.lim = n; return this; }
    private run(): { data: any; count?: number } {
      const rows = tables[this.table].filter(r => this.filters.every(f => f(r))).slice(0, this.lim);
      if (this.op === 'update') { rows.forEach(r => Object.assign(r, this.patch)); return { data: this.wantRows ? rows.map(r => ({ ...r })) : null }; }
      return { data: this.head ? null : rows.map(r => ({ ...r })), count: rows.length };
    }
    maybeSingle() { const { data } = this.run(); return Promise.resolve({ data: data[0] ?? null, error: null }); }
    then(res: any, rej?: any) { return Promise.resolve({ ...this.run(), error: null }).then(res, rej); }
  }
  return { tables, client: { from: (t: string) => new Q(t) } };
}

const sha = (k: string) => createHash('sha256').update(k).digest('hex');
const KEY = 'author-secret-key-1234567890';
const ZH = { dish_name: '番茄炒蛋', description: null, reflection: '小時候媽媽常做的菜。', ingredients: '番茄 3個\n雞蛋 4顆', recipe: '番茄切塊。\n炒蛋。', photo_url: null };
const GOOD_ZH = { dish_name: '番茄炒蛋', reflection: '溫暖又簡單。', ingredients: '3個番茄', recipe: '煮。' };
const GOOD_EN = { dish_name: 'Tomato scrambled eggs', reflection: 'A dish my mother often made.', ingredients: '3 tomatoes\n4 eggs', recipe: 'Cut the tomatoes.\nScramble the eggs.' };

// A fake AI provider for both the moderation call and the translation call.
const realFetch = globalThis.fetch;
let aiCalls: { url: string; body: any }[] = [];
let moderationVerdict = 'clean';
globalThis.fetch = (async (url: any, init: any) => {
  const u = String(url);
  if (u.startsWith('http://127.0.0.1')) return realFetch(url, init); // calls to our own test server
  const body = JSON.parse(init.body);
  aiCalls.push({ url: u, body });
  const sys: string = body.messages?.[0]?.content || '';
  const isTranslate = /^You translate posts/.test(sys);
  const toZh = /from English into/.test(sys);
  const content = isTranslate ? JSON.stringify(toZh ? GOOD_ZH : GOOD_EN) : JSON.stringify({ verdict: moderationVerdict, reasons: [] });
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
}) as any;
process.env.XAI_API_KEY = 'gsk_test';
process.env.MODERATION_API_KEY = 'gsk_test';
delete process.env.AI_API_KEY; delete process.env.TRANSLATE_API_KEY;

const db = makeDb();
const app = createApiApp({ admin: () => db.client });
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const post = (path: string, body: unknown) => realFetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, json: await r.json().catch(() => ({})) }));
const addPost = (id: string, extra: Row = {}) => db.tables.posts.push({ id, status: 'pending', screened_at: null, owner_key_hash: sha(KEY), spirit_tags: ['Joy'], category: 'Main', translated: null, translation_status: null, translation_attempts: 0, source_lang: null, ...ZH, ...extra });
const row = (id: string) => db.tables.posts.find(r => r.id === id)!;

console.log('screening queues the translation');
await test('a clean post goes live, its language is recorded and translation is queued', async () => {
  addPost('p1'); moderationVerdict = 'clean';
  const r = await post('/api/posts/p1/screen', { key: KEY });
  assert.equal(r.json.state, 'live');
  assert.equal(row('p1').status, 'visible'); assert.equal(row('p1').source_lang, 'zh'); assert.equal(row('p1').translation_status, 'pending');
});
await test('a flagged post still records its language, but stays pending for the admin (and is not translated until approved)', async () => {
  addPost('p2'); moderationVerdict = 'flag';
  const r = await post('/api/posts/p2/screen', { key: KEY });
  assert.equal(r.json.state, 'pending');
  assert.equal(row('p2').status, 'pending'); assert.equal(row('p2').source_lang, 'zh');
});
await test('an English post is recorded as English', async () => {
  addPost('p3', { dish_name: 'Tomato eggs', reflection: 'Warm and simple.', ingredients: '3 tomatoes', recipe: 'Cook.' }); moderationVerdict = 'clean';
  await post('/api/posts/p3/screen', { key: KEY });
  assert.equal(row('p3').source_lang, 'en');
});

console.log('the translate route');
await test('wrong key: refused, nothing translated', async () => {
  aiCalls = [];
  const r = await post('/api/posts/p1/translate', { key: 'a-different-key-0123456789' });
  assert.equal(r.status, 403); assert.equal(aiCalls.length, 0); assert.equal(row('p1').translated, null);
});
await test('right key: the post gets its English version and status done', async () => {
  aiCalls = [];
  const r = await post('/api/posts/p1/translate', { key: KEY });
  assert.equal(r.status, 200); assert.equal(r.json.done, 1);
  assert.equal(row('p1').translation_status, 'done');
  assert.equal(row('p1').translated.dish_name, 'Tomato scrambled eggs');
  assert.equal(row('p1').dish_name, '番茄炒蛋', 'the original is untouched');
  assert.equal(aiCalls.length, 1);
  const tr = aiCalls[0].body;
  assert.match(tr.messages[0].content, /from Traditional Chinese[^]*into English/);
  assert.equal(typeof tr.max_tokens, 'number');
  assert.equal(tr.model, 'openai/gpt-oss-120b');
});
await test('asking again does not translate twice', async () => {
  aiCalls = [];
  await post('/api/posts/p1/translate', { key: KEY });
  assert.equal(aiCalls.length, 0);
});
await test('a pending (unapproved) post is not translated even with the right key', async () => {
  aiCalls = [];
  await post('/api/posts/p2/translate', { key: KEY });
  assert.equal(aiCalls.length, 0); assert.equal(row('p2').translated, null);
});
await test('the queue runner translates waiting posts and is throttled', async () => {
  aiCalls = [];
  const first = await post('/api/translate/run', {});
  assert.equal(first.status, 200); assert.equal(first.json.done, 1); // p3
  assert.equal(row('p3').translation_status, 'done');
  const second = await post('/api/translate/run', {});
  assert.equal(second.json.throttled, true);
});

console.log('editing');
const goodEdit = { key: KEY, dishName: '番茄炒蛋', reflection: '更新的心得。', ingredients: '番茄 3個', recipe: '炒。', spiritTags: ['Joy'], category: 'Main' };
await test('an edit with no ingredients or no method is refused', async () => {
  let r = await post('/api/posts/p1/edit', { ...goodEdit, ingredients: '  ' });
  assert.equal(r.status, 400); assert.equal(r.json.code, 'RECIPE_REQUIRED');
  r = await post('/api/posts/p1/edit', { ...goodEdit, recipe: undefined });
  assert.equal(r.json.code, 'RECIPE_REQUIRED');
});
await test('an edit with no feeling is refused', async () => {
  const r = await post('/api/posts/p1/edit', { ...goodEdit, spiritTags: [] });
  assert.equal(r.status, 400); assert.equal(r.json.code, 'FEELING_REQUIRED');
  assert.equal((await post('/api/posts/p1/edit', { ...goodEdit, spiritTags: ['NotAFeeling'] })).json.code, 'FEELING_REQUIRED');
});
await test('an edit with the wrong key is refused and changes nothing', async () => {
  const before = JSON.stringify(row('p1'));
  const r = await post('/api/posts/p1/edit', { ...goodEdit, key: 'a-different-key-0123456789' });
  assert.equal(r.status, 403); assert.equal(JSON.stringify(row('p1')), before);
});
await test('a valid edit drops the stale translation at once and queues a new one', async () => {
  assert.equal(row('p1').translation_status, 'done');
  moderationVerdict = 'clean';
  const r = await post('/api/posts/p1/edit', goodEdit);
  assert.equal(r.status, 200);
  const p = row('p1');
  assert.equal(p.reflection, '更新的心得。');
  assert.equal(p.translated, null); assert.equal(p.translation_status, 'pending'); assert.equal(p.translation_attempts, 0); assert.equal(p.source_lang, 'zh');
});
await test('an edit that switches language flips the recorded source language', async () => {
  const r = await post('/api/posts/p1/edit', { ...goodEdit, dishName: 'Tomato eggs', reflection: 'Now written in English.', ingredients: '3 tomatoes', recipe: 'Cook them.' });
  assert.equal(r.status, 200); assert.equal(row('p1').source_lang, 'en');
});

server.close();
globalThis.fetch = realFetch;
console.log(failures.length ? `\n${failures.length} FAILED, ${passed} passed` : `\nall ${passed} passed`);
process.exitCode = failures.length ? 1 : 0;
