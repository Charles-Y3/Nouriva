import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useT } from '../hooks/useT';
import { SPIRIT_TAGS } from '../types';
import type { Draft, Post } from '../types';
import { AiAssistError, inspireDish, type DishSuggestion } from '../services/aiService';
import { searchPosts } from '../services/postsApi';
import { isSupabaseConfigured } from '../services/supabase';
import { isAiConsentShown, markAiConsentShown } from '../services/aiConsent';
import ConsentNotice from './ConsentNotice';
import PostCard from './PostCard';

export default function InspireMeModal({
  onClose,
  onCookThis,
  onOpenPost,
}: {
  onClose: () => void;
  onCookThis: (draftId: string) => void;
  onOpenPost: (id: string) => void;
}) {
  const { saveDraft } = useApp();
  const t = useT();

  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [showConsent, setShowConsent] = useState(!isAiConsentShown());

  const [suggestion, setSuggestion] = useState<DishSuggestion | null>(null);
  const [suggestionState, setSuggestionState] = useState<'idle' | 'loading' | 'no_key' | 'error'>('idle');

  const [communityPosts, setCommunityPosts] = useState<Post[] | null>(null);
  const [communityLoading, setCommunityLoading] = useState(false);

  function pickTag(tag: string) {
    setSelectedTag(tag);
    setSuggestion(null);
    fetchSuggestion(tag);
    fetchCommunity(tag);
  }

  function pickSurprise() {
    const random = SPIRIT_TAGS[Math.floor(Math.random() * SPIRIT_TAGS.length)];
    pickTag(random);
  }

  async function fetchSuggestion(tag: string) {
    markAiConsentShown();
    setShowConsent(false);
    setSuggestionState('loading');
    try {
      const result = await inspireDish(tag);
      setSuggestion(result);
      setSuggestionState('idle');
    } catch (err) {
      if (err instanceof AiAssistError && err.reason === 'no_api_key') {
        setSuggestionState('no_key');
      } else {
        setSuggestionState('error');
      }
    }
  }

  async function fetchCommunity(tag: string) {
    if (!isSupabaseConfigured()) {
      setCommunityPosts(null);
      return;
    }
    setCommunityLoading(true);
    try {
      const posts = await searchPosts('', tag);
      setCommunityPosts(posts.slice(0, 2));
    } catch {
      setCommunityPosts([]);
    } finally {
      setCommunityLoading(false);
    }
  }

  function cookThis() {
    if (!suggestion || !selectedTag) return;
    const now = Date.now();
    const draft: Draft = {
      id: 'draft_' + now,
      dishName: suggestion.dishName,
      reflection: '',
      ingredients: suggestion.ingredients,
      recipe: suggestion.recipe,
      spiritTags: [selectedTag],
      createdAt: now,
      updatedAt: now,
    };
    saveDraft(draft);
    onCookThis(draft.id);
  }

  // Escape closes, same as clicking the backdrop / the X.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-ink-900/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-linen-50 rounded-t-2xl sm:rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 shadow-xl">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-ink-900">{t.inspireMe.title}</h2>
          <button type="button" onClick={onClose} className="text-ink-500 hover:text-ink-900">
            ✕
          </button>
        </div>
        <p className="text-sm text-ink-500 mb-4">{t.inspireMe.subtitle}</p>

        <div className="flex flex-wrap gap-2 mb-2">
          {SPIRIT_TAGS.map(tag => (
            <button
              key={tag}
              type="button"
              onClick={() => pickTag(tag)}
              className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                selectedTag === tag
                  ? 'bg-sage-500 border-sage-500 text-linen-50'
                  : 'bg-linen-100 border-linen-200 text-ink-700 hover:border-sage-400'
              }`}
            >
              {t.spiritTags[tag]}
            </button>
          ))}
          <button
            type="button"
            onClick={pickSurprise}
            className="rounded-full border border-clay-500 px-3.5 py-1.5 text-sm text-clay-700 hover:bg-clay-500/10"
          >
            {t.inspireMe.surpriseMe}
          </button>
        </div>

        {selectedTag && (
          <div className="mt-4 space-y-5">
            {showConsent && <ConsentNotice onDismiss={() => { markAiConsentShown(); setShowConsent(false); }} />}

            {suggestionState === 'loading' && (
              <p className="text-sm text-ink-500">{t.inspireMe.loadingSuggestion}</p>
            )}

            {suggestionState === 'no_key' && (
              <p className="text-sm text-ink-500">{t.inspireMe.noKey}</p>
            )}

            {suggestionState === 'error' && (
              <p className="text-sm text-clay-700">{t.inspireMe.suggestionFailed}</p>
            )}

            {suggestion && suggestionState === 'idle' && (
              <div className="bg-linen-100 border border-linen-200 rounded-2xl p-4">
                <h3 className="font-semibold text-ink-900">{suggestion.dishName}</h3>
                <p className="mt-1.5 text-sm text-ink-700">{suggestion.blurb}</p>
                <div className="mt-3 space-y-2 text-sm text-ink-700">
                  <div>
                    <p className="font-medium text-ink-900">{t.inspireMe.ingredientsHeading}</p>
                    <p className="whitespace-pre-line text-ink-500">{suggestion.ingredients}</p>
                  </div>
                  <div>
                    <p className="font-medium text-ink-900">{t.inspireMe.recipeHeading}</p>
                    <p className="whitespace-pre-line text-ink-500">{suggestion.recipe}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={cookThis}
                    className="bg-clay-600 hover:bg-clay-700 text-linen-50 rounded-full px-4 py-1.5 text-sm font-medium"
                  >
                    {t.inspireMe.cookThis}
                  </button>
                  <button
                    type="button"
                    onClick={() => fetchSuggestion(selectedTag)}
                    className="text-sm text-clay-700 hover:text-clay-600 underline"
                  >
                    {t.inspireMe.anotherIdea}
                  </button>
                </div>
              </div>
            )}

            {isSupabaseConfigured() && (
              <div>
                <h3 className="text-sm font-semibold text-ink-500 uppercase tracking-wide mb-2">
                  {t.inspireMe.communityHeading(t.spiritTags[selectedTag])}
                </h3>
                {communityLoading && <p className="text-sm text-ink-500">{t.common.loading}</p>}
                {!communityLoading && communityPosts && communityPosts.length === 0 && (
                  <p className="text-sm text-ink-500">{t.inspireMe.communityEmpty}</p>
                )}
                {!communityLoading && communityPosts && communityPosts.length > 0 && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {communityPosts.map(p => (
                      <PostCard key={p.id} post={p} onOpen={onOpenPost} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
