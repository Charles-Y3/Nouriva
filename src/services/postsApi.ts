import { supabase } from './supabase';
import type { NutritionEstimate, Post, ReactionType } from '../types';

const POST_COLUMNS = 'id, dish_name, description, photo_url, ingredients, recipe, reflection, spirit_tags, nutrition, created_at, reaction_felt_count, reaction_inspired_count, reaction_thanks_count, report_count, status';

export async function fetchRecentPosts(limit = 12): Promise<Post[]> {
  const { data, error } = await supabase
    .from('posts')
    .select(POST_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as Post[];
}

export async function fetchAllPosts(): Promise<Post[]> {
  const { data, error } = await supabase
    .from('posts')
    .select(POST_COLUMNS)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Post[];
}

// Full-text search over dish name / reflection / ingredients / recipe /
// tags, backed by the `search_vector` tsvector column (kept in sync by a
// trigger — see db/schema.sql) + GIN index — runs entirely in Postgres, no
// extra hosting piece, and stays within the same anon SELECT RLS policy as
// every other read. `tag` narrows results to posts carrying that exact
// spirit tag; either argument alone is fine (empty query + a tag =
// "browse by tag").
//
// `config: 'simple'` is required and must match the config the trigger
// builds search_vector with — PostgREST's .textSearch() otherwise builds
// its tsquery with the database's default config (commonly 'english'),
// which tokenizes/stems differently from 'simple' and silently matches
// nothing even though the searched word is right there in the vector.
export async function searchPosts(query: string, tag: string | null): Promise<Post[]> {
  let q = supabase.from('posts').select(POST_COLUMNS);
  const trimmed = query.trim();
  if (trimmed) {
    q = q.textSearch('search_vector', trimmed, { type: 'websearch', config: 'simple' });
  }
  if (tag) {
    q = q.contains('spirit_tags', [tag]);
  }
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw error;
  return data as Post[];
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
  nutrition?: NutritionEstimate;
}

export async function createPost(post: NewPost): Promise<Post> {
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
      nutrition: post.nutrition || null,
    })
    .select(POST_COLUMNS)
    .single();
  if (error) throw error;
  return data as Post;
}

export async function reactToPost(postId: string, reaction: ReactionType): Promise<void> {
  const { error } = await supabase.rpc('react_to_post', { post_id: postId, reaction });
  if (error) throw error;
}

export async function reportPost(postId: string): Promise<void> {
  const { error } = await supabase.rpc('report_post', { post_id: postId });
  if (error) throw error;
}
