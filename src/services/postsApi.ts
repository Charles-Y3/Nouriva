import { supabase } from './supabase';
import { generateShareKey, getDeviceId, hashShareKey } from './shareKeys';
import type { BrowseSort, NutritionEstimate, Post, ReactionType } from '../types';
import { applyKeywords, keywordPlan } from './searchQuery';

const POST_COLUMNS = 'id, dish_name, description, photo_url, ingredients, recipe, reflection, spirit_tags, category, nutrition, created_at, reaction_felt_count, reaction_inspired_count, reaction_thanks_count, report_count, status, author_hidden, source_lang, translated, translation_status';

export interface PostQuery {
  query?: string;
  tag?: string | null;
  category?: string | null;
  sort?: BrowseSort;
  limit?: number;
}

// One query for Browse: optional full-text search + feeling + category
// filters + sort, all in Postgres, all inside the same anon SELECT RLS
// policy as every other read.
//
// The text search is a keyword (substring) search over `search_text`, a
// lower-cased string kept in sync by a trigger (db/schema.sql section 9) with
// everything a reader could look for, in the author's words and the generated
// translation. The old tsvector search couldn't find a word inside a Chinese
// phrase (no spaces, so the phrase was one token). See searchQuery.ts.
export async function queryPosts({ query = '', tag = null, category = null, sort = 'recent', limit }: PostQuery = {}): Promise<Post[]> {
  const plan = await keywordPlan(query);
  const build = (legacySearch: boolean) => {
    let q = supabase.from('posts').select(POST_COLUMNS);
    if (legacySearch) {
      if (query.trim()) q = q.textSearch('search_vector', query.trim(), { type: 'websearch', config: 'simple' });
    } else {
      q = applyKeywords(q, 'search_text', plan);
    }
    if (tag) q = q.contains('spirit_tags', [tag]);
    if (category) q = q.eq('category', category);
    q = sort === 'popular'
      ? q.order('reaction_total', { ascending: false }).order('created_at', { ascending: false })
      : q.order('created_at', { ascending: false });
    if (limit) q = q.limit(limit);
    return q;
  };
  let { data, error } = await build(false);
  // Until db/schema.sql section 9 has been run, `search_text` doesn't exist: fall back to the
  // old word search rather than breaking Browse. (Postgres 42703 = undefined column.)
  if (error && plan.length > 0 && (error.code === '42703' || /search_text/.test(error.message || ''))) {
    ({ data, error } = await build(true));
  }
  if (error) throw error;
  return data as Post[];
}

// Kept for callers that just want "posts under this feeling" (Inspire me).
export function searchPosts(query: string, tag: string | null): Promise<Post[]> {
  return queryPosts({ query, tag });
}

export async function fetchPostById(id: string): Promise<Post | null> {
  const { data, error } = await supabase
    .from('posts')
    .select(POST_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as Post | null;
}

export interface NewPost {
  dishName: string;
  description?: string;
  photoUrl?: string;
  ingredients?: string;
  recipe?: string;
  reflection: string;
  spiritTags: string[];
  category?: string;
  nutrition?: NutritionEstimate;
}

export class ShareError extends Error {
  code: 'rate_limit' | 'duplicate' | 'blocked' | 'removed' | 'unavailable' | 'toggle_limit' | 'unknown';
  constructor(code: ShareError['code'], message: string) {
    super(message);
    this.code = code;
    this.name = 'ShareError';
  }
}

// Creates the post plus its author key. A new post is inserted as 'pending'
// (the only status the database lets the browser write), then the server's
// screening route decides whether it goes live now or waits for the admin.
// Returns the post id, the plaintext key — the caller must keep the key (see
// AppContext.markPublished): the server only ever sees its hash, so a lost key
// means no hide/edit later — and whether the post is live or waiting.
export async function createPost(post: NewPost): Promise<{ id: string; key: string; state: 'live' | 'pending' }> {
  const key = generateShareKey();
  // The id is chosen here because a pending row can't be read back (the
  // public SELECT policy only shows visible posts).
  const id = crypto.randomUUID();
  const { error } = await supabase
    .from('posts')
    .insert({
      id,
      status: 'pending',
      dish_name: post.dishName,
      description: post.description || null,
      photo_url: post.photoUrl || null,
      ingredients: post.ingredients || null,
      recipe: post.recipe || null,
      reflection: post.reflection,
      spirit_tags: post.spiritTags,
      category: post.category || null,
      nutrition: post.nutrition || null,
      owner_key_hash: await hashShareKey(key),
      device_id: getDeviceId(),
    });
  if (error) {
    const msg = error.message || '';
    if (msg.includes('nouriva_rate_limit')) throw new ShareError('rate_limit', msg);
    if (msg.includes('nouriva_duplicate')) throw new ShareError('duplicate', msg);
    if (msg.includes('posts_no_blocked_content')) throw new ShareError('blocked', msg);
    throw new ShareError('unknown', msg);
  }
  // If the screening request itself fails the post simply stays pending — the
  // admin queue lists it — so the author is told it is waiting, not that it failed.
  let state: 'live' | 'pending' = 'pending';
  try {
    const res = await fetch(`/api/posts/${id}/screen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    const payload = await res.json().catch(() => ({}));
    if (res.ok && payload.state === 'live') {
      state = 'live';
      requestTranslation(id, key);
    }
  } catch {
    // stays pending
  }
  return { id, key, state };
}

export async function reactToPost(postId: string, reaction: ReactionType): Promise<void> {
  const { error } = await supabase.rpc('react_to_post', { post_id: postId, reaction });
  if (error) throw error;
}

export async function reportPost(postId: string): Promise<void> {
  const { error } = await supabase.rpc('report_post', { post_id: postId });
  if (error) throw error;
}

// Asks the server to translate a post that just went live (or was just edited).
// Fire and forget: if it fails or the provider's quota is out, the post stays
// in the server's queue and shows its original until the translation lands.
export function requestTranslation(id: string, key: string): void {
  fetch(`/api/posts/${id}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  }).catch(() => {});
}

// Browse notices a post still waiting for its translation and nudges the
// queue, at most once every two minutes per tab.
let lastNudge = 0;
export function nudgeTranslationQueue(): void {
  if (Date.now() - lastNudge < 120_000) return;
  lastNudge = Date.now();
  fetch('/api/translate/run', { method: 'POST' }).catch(() => {});
}
