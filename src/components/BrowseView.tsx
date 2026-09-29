import { useEffect, useMemo, useState } from 'react';
import { fetchRecentPosts, searchPosts } from '../services/postsApi';
import { isSupabaseConfigured } from '../services/supabase';
import { SPIRIT_TAGS } from '../types';
import type { Post } from '../types';
import { useT } from '../hooks/useT';
import PostCard from './PostCard';
import EmptyState from './EmptyState';
import InspireMeModal from './InspireMeModal';

// Merged Home + Explore: intro/CTA up top, then search + tag filter + the
// full browsable list — one screen for "see recent" and "find something
// specific" rather than two separate views with overlapping purpose.
export default function BrowseView({
  onCreate,
  onOpenPost,
  onInspireDraft,
}: {
  onCreate: () => void;
  onOpenPost: (id: string) => void;
  onInspireDraft: (draftId: string) => void;
}) {
  const t = useT();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [showInspire, setShowInspire] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setError('not_configured');
      return;
    }
    fetchRecentPosts(12)
      .then(setPosts)
      .catch(() => setError('load_failed'));
  }, []);

  // Debounced search/filter — runs whenever the query or tag changes, once
  // either is non-empty; reverts to the plain "recent" feed when both are
  // cleared again.
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    if (!query.trim() && !activeTag) {
      setBrowsing(false);
      return;
    }
    setBrowsing(true);
    const handle = setTimeout(() => {
      searchPosts(query, activeTag)
        .then(setPosts)
        .catch(() => setError('load_failed'));
    }, 300);
    return () => clearTimeout(handle);
  }, [query, activeTag]);

  const isFiltering = useMemo(() => browsing, [browsing]);

  return (
    <div className="pt-2">
      <div className="text-center py-6">
        <h1 className="text-2xl font-semibold text-ink-900">{t.browse.heading}</h1>
        <p className="mt-2 text-ink-500 max-w-md mx-auto">{t.browse.subtitle}</p>
        <div className="mt-5 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={onCreate}
            className="bg-clay-600 hover:bg-clay-700 text-linen-50 rounded-full px-6 py-2.5 text-sm font-medium transition-colors"
          >
            {t.browse.shareCta}
          </button>
          <button
            type="button"
            onClick={() => setShowInspire(true)}
            className="bg-linen-100 border border-linen-200 hover:border-sage-400 text-ink-700 rounded-full px-5 py-2.5 text-sm font-medium transition-colors"
          >
            {t.browse.inspireCta}
          </button>
        </div>
      </div>

      {showInspire && (
        <InspireMeModal
          onClose={() => setShowInspire(false)}
          onCookThis={(draftId) => {
            setShowInspire(false);
            onInspireDraft(draftId);
          }}
          onOpenPost={onOpenPost}
        />
      )}

      {isSupabaseConfigured() && (
        <div className="space-y-3 mb-5">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t.browse.searchPlaceholder}
            className="w-full rounded-full border border-linen-200 bg-linen-100 px-4 py-2.5 text-sm placeholder:text-ink-500/60"
          />
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveTag(null)}
              className={`rounded-full px-3 py-1 text-xs border transition-colors ${
                activeTag === null
                  ? 'bg-sage-500 border-sage-500 text-linen-50'
                  : 'bg-linen-100 border-linen-200 text-ink-700 hover:border-sage-400'
              }`}
            >
              {t.browse.allTags}
            </button>
            {SPIRIT_TAGS.map(tag => (
              <button
                key={tag}
                onClick={() => setActiveTag(prev => (prev === tag ? null : tag))}
                className={`rounded-full px-3 py-1 text-xs border transition-colors ${
                  activeTag === tag
                    ? 'bg-sage-500 border-sage-500 text-linen-50'
                    : 'bg-linen-100 border-linen-200 text-ink-700 hover:border-sage-400'
                }`}
              >
                {t.spiritTags[tag]}
              </button>
            ))}
          </div>
        </div>
      )}

      {error === 'not_configured' && <EmptyState title={t.browse.notConfiguredTitle} body={t.browse.notConfiguredBody} />}
      {error === 'load_failed' && <EmptyState title={t.browse.loadFailedTitle} body={t.browse.loadFailedBody} />}
      {posts && posts.length === 0 && !isFiltering && (
        <EmptyState title={t.browse.emptyTitle} body={t.browse.emptyBody} />
      )}
      {posts && posts.length === 0 && isFiltering && (
        <EmptyState title={t.browse.noResultsTitle} body={t.browse.noResultsBody} />
      )}
      {posts && posts.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {posts.map(p => (
            <PostCard key={p.id} post={p} onOpen={onOpenPost} />
          ))}
        </div>
      )}
    </div>
  );
}
