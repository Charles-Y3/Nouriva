import { useEffect, useMemo, useState } from 'react';
import { queryPosts } from '../services/postsApi';
import { isSupabaseConfigured } from '../services/supabase';
import { CATEGORIES, SPIRIT_TAGS } from '../types';
import type { BrowseSort, Post } from '../types';
import { useT } from '../hooks/useT';
import PostCard from './PostCard';
import EmptyState from './EmptyState';
import InspireMeModal from './InspireMeModal';

// Merged Home + Explore: intro/CTA up top, then search + tag filter + the
// full browsable list — one screen for "see recent" and "find something
// specific" rather than two separate views with overlapping purpose.
const selectClass =
  'w-full min-w-0 rounded-full border border-linen-200 bg-linen-100 px-3 py-2 text-sm text-ink-700 focus:border-sage-400';

export default function BrowseView({
  onCreate,
  onOpenPost,
  onInspireDraft,
  inspireTag,
  onInspireTagHandled,
}: {
  onCreate: () => void;
  onOpenPost: (id: string) => void;
  onInspireDraft: (draftId: string) => void;
  inspireTag?: string | null;
  onInspireTagHandled?: () => void;
}) {
  const t = useT();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<BrowseSort>('recent');
  const [browsing, setBrowsing] = useState(false);
  const [showInspire, setShowInspire] = useState(false);

  // A Story's "cook something to match" lands here with a feeling to open
  // Inspire me on.
  useEffect(() => {
    if (inspireTag) setShowInspire(true);
  }, [inspireTag]);

  // Debounced: re-runs whenever the query or tag changes, including back to
  // both empty — that "back to empty" case must re-fetch the plain recent
  // feed itself (not just flip `browsing` off) or `posts` is left stuck on
  // whatever the last filtered/searched result set was, which is exactly
  // what made clicking "All" after a tag filter look like it did nothing.
  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setError('not_configured');
      return;
    }
    const isFilteringNow = Boolean(query.trim() || activeTag || activeCategory);
    setBrowsing(isFilteringNow);
    setError(null);
    const handle = setTimeout(() => {
      // The plain default feed stays small and quick; any filter or a
      // non-default sort shows the full matching set.
      const plainFeed = !isFilteringNow && sort === 'recent';
      queryPosts({ query, tag: activeTag, category: activeCategory, sort, limit: plainFeed ? 12 : undefined })
        .then(setPosts)
        .catch(() => setError('load_failed'));
    }, query.trim() ? 300 : 0);
    return () => clearTimeout(handle);
  }, [query, activeTag, activeCategory, sort]);

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
          initialTag={inspireTag}
          onClose={() => {
            setShowInspire(false);
            onInspireTagHandled?.();
          }}
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
          <div className="grid grid-cols-3 gap-2">
            <select
              value={activeTag ?? ''}
              onChange={e => setActiveTag(e.target.value || null)}
              aria-label={t.browse.feelingLabel}
              className={selectClass}
            >
              <option value="">{t.browse.anyFeeling}</option>
              {SPIRIT_TAGS.map(tag => (
                <option key={tag} value={tag}>{t.spiritTags[tag]}</option>
              ))}
            </select>
            <select
              value={activeCategory ?? ''}
              onChange={e => setActiveCategory(e.target.value || null)}
              aria-label={t.browse.categoryLabel}
              className={selectClass}
            >
              <option value="">{t.browse.allCategories}</option>
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{t.categories[c]}</option>
              ))}
            </select>
            <select
              value={sort}
              onChange={e => setSort(e.target.value as BrowseSort)}
              aria-label={t.browse.sortLabel}
              className={selectClass}
            >
              <option value="recent">{t.browse.sortRecent}</option>
              <option value="popular">{t.browse.sortPopular}</option>
            </select>
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
