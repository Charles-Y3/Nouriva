import type { MyPostRef, NutritionEstimate, Post } from '../types';
import { ShareError } from './postsApi';

// Author-side actions, authorised by the per-post share key (see
// shareKeys.ts). They go through the server (api/_app.ts) because anonymous
// visitors have no UPDATE rights on posts. When the server has no Supabase
// service key configured these throw ShareError('unavailable') and callers
// fall back to the public read path.

async function ownerFetch(url: string, body: unknown): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new ShareError('unavailable', 'Could not reach the server.');
  }
  const payload = await res.json().catch(() => ({}));
  if (res.ok) return payload;
  if (res.status === 503) throw new ShareError('unavailable', payload.error || 'Unavailable');
  if (payload.code === 'REMOVED_BY_MODERATOR') throw new ShareError('removed', payload.error);
  if (payload.code === 'TOGGLE_LIMIT') throw new ShareError('toggle_limit', payload.error);
  if (payload.code === 'BLOCKED_CONTENT') throw new ShareError('blocked', payload.error);
  if (payload.code === 'DUPLICATE') throw new ShareError('duplicate', payload.error);
  throw new ShareError('unknown', payload.error || 'Request failed');
}

/** The author's own posts, including ones they've hidden. Only posts whose
 * key matches are returned. */
export async function fetchMyPosts(refs: MyPostRef[]): Promise<Post[]> {
  const withKeys = refs.filter((r): r is MyPostRef & { key: string } => Boolean(r.key));
  if (withKeys.length === 0) return [];
  const { posts } = await ownerFetch('/api/my/posts', { refs: withKeys.map(r => ({ id: r.id, key: r.key })) });
  return posts as Post[];
}

export async function setPostHidden(id: string, key: string, hidden: boolean): Promise<void> {
  await ownerFetch(`/api/posts/${id}/visibility`, { key, hidden });
}

export interface EditedPost {
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

export async function editPost(id: string, key: string, post: EditedPost): Promise<void> {
  await ownerFetch(`/api/posts/${id}/edit`, { key, ...post });
}
