import { ingredientLines } from '../utils/ingredients';
import { useEffect, useState } from 'react';
import { fetchPostById } from '../services/postsApi';
import { useT } from '../hooks/useT';
import type { Post } from '../types';
import ReactionBar from './ReactionBar';
import { useLocalizePost } from '../hooks/useLocalizePost';
import type { LocalizedPost } from '../services/postLocale';
import ReportButton from './ReportButton';

export default function PostDetail({ postId, onBack }: { postId: string; onBack: () => void }) {
  const t = useT();
  const [rawPost, setPost] = useState<Post | null | undefined>(undefined);
  const localize = useLocalizePost();
  const post: LocalizedPost | null | undefined = rawPost ? localize(rawPost) : rawPost;
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchPostById(postId)
      .then(setPost)
      .catch(() => setPost(null));
  }, [postId]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — the URL is already in the address bar.
    }
  }

  return (
    <div className="min-h-screen bg-linen-50 text-ink-900">
      <header className="border-b border-linen-200 sticky top-0 bg-linen-50/95 backdrop-blur z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <button type="button" onClick={onBack} className="text-sm text-ink-500 hover:text-ink-900">
            ← Nouriva
          </button>
          <button type="button" onClick={copyLink} className="text-sm text-clay-700 hover:text-clay-600">
            {copied ? t.postDetail.linkCopied : t.postDetail.copyLink}
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {post === undefined && <p className="text-ink-500 text-center py-16">{t.common.loading}</p>}
        {post === null && <p className="text-ink-500 text-center py-16">{t.postDetail.notFound}</p>}
        {post && (
          <article>
            {post.photo_url && (
              <img src={post.photo_url} alt={post.dish_name} className="w-full rounded-2xl mb-5 object-cover max-h-[420px]" />
            )}
            <h1 className="text-2xl font-semibold">
              {post.dish_name}
              {post.originalPending && (
                <span className="ml-2 align-middle rounded-full border border-linen-200 px-2 py-0.5 text-xs font-medium text-ink-500">{t.browse.originalTag}</span>
              )}
            </h1>
            {post.description && <p className="text-ink-500 mt-1">{post.description}</p>}

            <blockquote className="mt-5 text-lg leading-relaxed text-ink-700 italic border-l-2 border-clay-500 pl-4">
              "{post.reflection}"
            </blockquote>

            {post.spirit_tags.length > 0 && (
              <p className="mt-3 text-sage-600">✨ {post.spirit_tags.map(tag => t.spiritTags[tag] || tag).join(' · ')}</p>
            )}

            {(post.ingredients || post.recipe || post.nutrition) && (
              <div className="mt-8 space-y-4 text-sm text-ink-700 border-t border-linen-200 pt-6">
                {post.ingredients && (
                  <div>
                    <h2 className="font-semibold text-ink-900 mb-1">{t.postDetail.ingredientsHeading}</h2>
                    <ul>
                      {ingredientLines(post.ingredients).map((line, i) => <li key={i}>{line}</li>)}
                    </ul>
                  </div>
                )}
                {post.recipe && (
                  <div>
                    <h2 className="font-semibold text-ink-900 mb-1">{t.postDetail.recipeHeading}</h2>
                    <p className="whitespace-pre-line">{post.recipe}</p>
                  </div>
                )}
                {post.nutrition && (
                  <div>
                    <h2 className="font-semibold text-ink-900 mb-1">{t.postDetail.nutritionHeading}</h2>
                    <p className="text-ink-500">
                      {[
                        post.nutrition.calories !== undefined && `${post.nutrition.calories} kcal`,
                        post.nutrition.proteinGrams !== undefined && `${post.nutrition.proteinGrams}g ${t.nutritionShort.protein}`,
                        post.nutrition.carbsGrams !== undefined && `${post.nutrition.carbsGrams}g ${t.nutritionShort.carbs}`,
                        post.nutrition.fatGrams !== undefined && `${post.nutrition.fatGrams}g ${t.nutritionShort.fat}`,
                        post.nutrition.fiberGrams !== undefined && `${post.nutrition.fiberGrams}g ${t.nutritionShort.fiber}`,
                      ].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="mt-8 pt-5 border-t border-linen-200 flex items-center justify-between">
              <ReactionBar post={post} />
              <ReportButton postId={post.id} />
            </div>
          </article>
        )}
      </main>
    </div>
  );
}
