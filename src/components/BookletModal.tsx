import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useT } from '../hooks/useT';
import { fetchPostById } from '../services/postsApi';
import { getDraftPhoto, blobToDataUrl } from '../services/localDrafts';
import type { BookletItem } from '../services/recipeBooklet';
import { BOOKLET_THEMES, type BookletThemeId } from '../services/bookletThemes';
import { STORIES, currentStoryWeek, storyText } from '../data/stories';
import type { Draft, Post } from '../types';

// Printed (and linked) on the booklet's back cover — the deployed app, not
// whatever origin the booklet happens to be generated from (e.g. localhost).
const APP_URL = 'https://nourivaveg.vercel.app';

type PoolKey = 'shared' | 'liked' | 'drafts';

function itemKey(pool: PoolKey, id: string) {
  return `${pool}:${id}`;
}

export default function BookletModal({ onClose }: { onClose: () => void }) {
  const { drafts, myPostIds, reactionsGiven, preferences } = useApp();
  const t = useT();

  const [sharedPosts, setSharedPosts] = useState<Post[]>([]);
  const [likedPosts, setLikedPosts] = useState<Post[]>([]);
  const [loadingPools, setLoadingPools] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [dedication, setDedication] = useState('');
  const [theme, setTheme] = useState<BookletThemeId>('forest');
  const [includeStory, setIncludeStory] = useState(false);

  const likedPostIds = useMemo(() => {
    const ids = new Set<string>();
    reactionsGiven.forEach(entry => ids.add(entry.split(':')[0]));
    return [...ids];
  }, [reactionsGiven]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      Promise.all(myPostIds.map(ref => fetchPostById(ref.id).catch(() => null))),
      Promise.all(likedPostIds.map(id => fetchPostById(id).catch(() => null))),
    ]).then(([shared, liked]) => {
      if (cancelled) return;
      setSharedPosts(shared.filter((p): p is Post => p !== null));
      setLikedPosts(liked.filter((p): p is Post => p !== null));
      setLoadingPools(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(key: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAll(pool: PoolKey, ids: string[]) {
    const keys = ids.map(id => itemKey(pool, id));
    const allSelected = keys.every(k => selected.has(k));
    setSelected(prev => {
      const next = new Set(prev);
      keys.forEach(k => (allSelected ? next.delete(k) : next.add(k)));
      return next;
    });
  }

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const items: BookletItem[] = [];

      for (const post of sharedPosts) {
        if (selected.has(itemKey('shared', post.id))) items.push(postToItem(post));
      }
      for (const post of likedPosts) {
        const key = itemKey('liked', post.id);
        // A post already added from "shared" (you reacted to your own
        // post) shouldn't get a duplicate page.
        if (selected.has(key) && !items.some(i => i.id === post.id)) items.push(postToItem(post));
      }
      for (const draft of drafts) {
        if (!selected.has(itemKey('drafts', draft.id))) continue;
        let photoSrc: string | undefined = draft.photoPreviewDataUrl;
        if (draft.photoDraftId) {
          const blob = await getDraftPhoto(draft.photoDraftId);
          if (blob) photoSrc = await blobToDataUrl(blob);
        }
        items.push({
          id: draft.id,
          dishName: draft.dishName,
          photoSrc,
          reflection: draft.reflection,
          ingredients: draft.ingredients,
          recipe: draft.recipe,
          spiritTags: draft.spiritTags,
          spiritTagLabels: t.spiritTags,
          categoryLabel: draft.category ? t.categories[draft.category] : undefined,
          nutrition: draft.nutrition,
        });
      }

      const { generateBookletPdf } = await import('../services/recipeBooklet');
      const story = includeStory ? storyText(STORIES[currentStoryWeek() - 1], preferences.language) : undefined;
      const blob = await generateBookletPdf(items, {
        title: title.trim() || t.booklet.defaultTitle,
        dedication: dedication.trim() || undefined,
        theme,
        editorNote: story,
        language: preferences.language,
        copy: {
          ingredientsHeading: t.postDetail.ingredientsHeading,
          recipeHeading: t.postDetail.recipeHeading,
          contentsHeading: t.booklet.contentsHeading,
          editorNoteHeading: t.booklet.editorNoteHeading,
          questionsHeading: t.stories.questionsHeading,
          recipeCount: t.booklet.recipeCount,
          nutritionHeading: t.postDetail.nutritionHeading,
          nutritionLabels: {
            calories: preferences.language === 'en' ? 'kcal' : '大卡',
            protein: t.nutritionShort.protein,
            carbs: t.nutritionShort.carbs,
            fat: t.nutritionShort.fat,
            fiber: t.nutritionShort.fiber,
          },
          madeWith: t.booklet.madeWith,
          tagline: t.tagline,
        },
        logoSrc: `${window.location.origin}/icon-192.png`,
        appUrl: APP_URL,
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nouriva-recipes-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      onClose();
    } catch {
      setError(t.booklet.generateFailed);
    } finally {
      setGenerating(false);
    }
  }

  function postToItem(post: Post): BookletItem {
    return {
      id: post.id,
      dishName: post.dish_name,
      photoSrc: post.photo_url || undefined,
      reflection: post.reflection,
      ingredients: post.ingredients || undefined,
      recipe: post.recipe || undefined,
      spiritTags: post.spirit_tags,
      spiritTagLabels: t.spiritTags,
      categoryLabel: post.category ? t.categories[post.category] : undefined,
      nutrition: post.nutrition,
    };
  }

  function Section({ title, pool, ids, labelFor }: { title: string; pool: PoolKey; ids: string[]; labelFor: (id: string) => string }) {
    if (ids.length === 0) return null;
    const allSelected = ids.length > 0 && ids.every(id => selected.has(itemKey(pool, id)));
    return (
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-ink-500 uppercase tracking-wide">{title}</h3>
          <button type="button" onClick={() => toggleAll(pool, ids)} className="text-xs text-clay-700 hover:text-clay-600 underline">
            {allSelected ? t.booklet.deselectAll : t.booklet.selectAll}
          </button>
        </div>
        <ul className="space-y-1.5">
          {ids.map(id => {
            const key = itemKey(pool, id);
            return (
              <li key={key}>
                <label className="flex items-center gap-2.5 text-sm text-ink-700 cursor-pointer">
                  <input type="checkbox" checked={selected.has(key)} onChange={() => toggle(key)} className="accent-clay-600" />
                  <span className="truncate">{labelFor(id)}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink-900/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-linen-50 rounded-t-2xl sm:rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 shadow-xl">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-ink-900">{t.booklet.title}</h2>
          <button type="button" onClick={onClose} className="text-ink-500 hover:text-ink-900">
            ✕
          </button>
        </div>
        <p className="text-sm text-ink-500 mb-4">{t.booklet.subtitle}</p>

        {loadingPools ? (
          <p className="text-sm text-ink-500">{t.common.loading}</p>
        ) : sharedPosts.length === 0 && likedPosts.length === 0 && drafts.length === 0 ? (
          <p className="text-sm text-ink-500">{t.booklet.nothingToInclude}</p>
        ) : (
          <>
            <Section title={t.myNouriva.sharedHeading} pool="shared" ids={sharedPosts.map(p => p.id)} labelFor={id => sharedPosts.find(p => p.id === id)?.dish_name || id} />
            <Section title={t.booklet.likedHeading} pool="liked" ids={likedPosts.map(p => p.id)} labelFor={id => likedPosts.find(p => p.id === id)?.dish_name || id} />
            <Section title={t.myNouriva.draftsHeading} pool="drafts" ids={drafts.map((d: Draft) => d.id)} labelFor={id => drafts.find((d: Draft) => d.id === id)?.dishName || t.booklet.untitledDraft} />
          </>
        )}

        <div className="mt-2 mb-4 space-y-3 border-t border-linen-200 pt-4">
          <label className="block text-xs text-ink-500">
            {t.booklet.titleLabel}
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={t.booklet.defaultTitle}
              maxLength={60}
              className="mt-1 w-full rounded-lg border border-linen-200 bg-linen-100 px-3 py-2 text-sm text-ink-900"
            />
          </label>
          <label className="block text-xs text-ink-500">
            {t.booklet.dedicationLabel}
            <input
              value={dedication}
              onChange={e => setDedication(e.target.value)}
              placeholder={t.booklet.dedicationPlaceholder}
              maxLength={140}
              className="mt-1 w-full rounded-lg border border-linen-200 bg-linen-100 px-3 py-2 text-sm text-ink-900"
            />
          </label>
          <div>
            <p className="text-xs text-ink-500 mb-1.5">{t.booklet.themeLabel}</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(BOOKLET_THEMES) as BookletThemeId[]).map(id => {
                const label = t.booklet['theme' + id.charAt(0).toUpperCase() + id.slice(1)];
                const active = theme === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTheme(id)}
                    aria-pressed={active}
                    className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      active ? 'border-clay-600 text-ink-900' : 'border-linen-200 text-ink-700 hover:border-sage-400'
                    }`}
                  >
                    <span className="inline-block w-3.5 h-3.5 rounded-full" style={{ backgroundColor: BOOKLET_THEMES[id].deep }} />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="flex items-center gap-2.5 text-sm text-ink-700 cursor-pointer">
            <input type="checkbox" checked={includeStory} onChange={e => setIncludeStory(e.target.checked)} className="accent-clay-600" />
            {t.booklet.includeStory}
          </label>
        </div>

        {error && <p className="text-sm text-clay-700 mb-3">{error}</p>}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            disabled={generating || selected.size === 0}
            onClick={generate}
            className="bg-clay-600 hover:bg-clay-700 disabled:opacity-50 text-linen-50 rounded-full px-6 py-2.5 text-sm font-medium"
          >
            {generating ? t.booklet.generating : t.booklet.generateButton(selected.size)}
          </button>
        </div>
      </div>
    </div>
  );
}
