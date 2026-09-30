import { supabase } from './supabase';
import { generateShareKey, getDeviceId, hashShareKey } from './shareKeys';
import type { BrowseSort, NutritionEstimate, Post, ReactionType } from '../types';

const POST_COLUMNS = 'id, dish_name, description, photo_url, ingredients, recipe, reflection, spirit_tags, category, nutrition, created_at, reaction_felt_count, reaction_inspired_count, reaction_thanks_count, report_count, status, author_hidden';

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
// The text search is backed by the `search_vector` tsvector column (kept in
// sync by a trigger — see db/schema.sql) + GIN index. `config: 'simple'` is
// required and must match the config the trigger builds search_vector with —
// PostgREST's .textSearch() otherwise builds its tsquery with the database's
// default config (commonly 'english'), which tokenizes/stems differently from
// 'simple' and silently matches nothing even though the searched word is
// right there in the vector.
export async function queryPosts({ query = '', tag = null, category = null, sort = 'recent', limit }: PostQuery = {}): Promise<Post[]> {
  let q = supabase.from('posts').select(POST_COLUMNS);
  const trimmed = query.trim();
  if (trimmed) q = q.textSearch('search_vector', trimmed, { type: 'websearch', config: 'simple' });
  if (tag) q = q.contains('spirit_tags', [tag]);
  if (category) q = q.eq('category', category);
  q = sort === 'popular'
    ? q.order('reaction_total', { ascending: false }).order('created_at', { ascending: false })
    : q.order('created_at', { ascending: false });
  if (limit) q = q.limit(limit);
  const { data, error } = await q;
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

// Creates the post plus its author key. Returns the post and the plaintext
// key — the caller must keep the key (see AppContext.markPublished): the
// server only ever sees its hash, so a lost key means no hide/edit later.
export async function createPost(post: NewPost): Promise<{ post: Post; key: string }> {
  const key = generateShareKey();
  const { data, error } = await supabase
    .from('posts')
    .insert({
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
    })
    .select(POST_COLUMNS)
    .single();
  if (error) {
    const msg = error.message || '';
    if (msg.includes('nouriva_rate_limit')) throw new ShareError('rate_limit', msg);
    if (msg.includes('nouriva_duplicate')) throw new ShareError('duplicate', msg);
    if (msg.includes('posts_no_blocked_content')) throw new ShareError('blocked', msg);
    throw new ShareError('unknown', msg);
  }
  return { post: data as Post, key };
}

export async function reactToPost(postId: string, reaction: ReactionType): Promise<void> {
  const { error } = await supabase.rpc('react_to_post', { post_id: postId, reaction });
  if (error) throw error;
}

export async function reportPost(postId: string): Promise<void> {
  const { error } = await supabase.rpc('report_post', { post_id: postId });
  if (error) throw error;
}
