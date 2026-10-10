import type { Post } from '../types';
import { useT } from '../hooks/useT';
import ReactionBar from './ReactionBar';
import { useLocalizePost } from '../hooks/useLocalizePost';

// Shows the post in the reader's settings language (see useLocalizePost); `rawPost` is what the author typed.
export default function PostCard({ post: rawPost, onOpen }: { post: Post; onOpen: (id: string) => void }) {
  const t = useT();
  const localize = useLocalizePost();
  const post = localize(rawPost);
  return (
    <article className="bg-linen-100 border border-linen-200 rounded-2xl overflow-hidden shadow-sm">
      <button type="button" onClick={() => onOpen(post.id)} className="block w-full text-left">
        {post.photo_url && (
          <img src={post.photo_url} alt={post.dish_name} className="w-full aspect-[4/3] object-cover" />
        )}
        <div className="p-4">
          <h3 className="text-base font-semibold text-ink-900">
            {post.dish_name}
            {post.originalPending && (
              <span className="ml-2 align-middle rounded-full border border-linen-200 px-1.5 py-0.5 text-[10px] font-medium text-ink-500">{t.browse.originalTag}</span>
            )}
          </h3>
          {post.description && (
            <p className="text-sm text-ink-500 mt-0.5">{post.description}</p>
          )}
          <p className="mt-2.5 text-[15px] leading-relaxed text-ink-700 italic">
            "{post.reflection.length > 220 ? post.reflection.slice(0, 220) + '…' : post.reflection}"
          </p>
          {post.spirit_tags.length > 0 && (
            <p className="mt-2 text-sm text-sage-600">
              ✨ {post.spirit_tags.map(tag => t.spiritTags[tag] || tag).join(' · ')}
            </p>
          )}
          {(post.ingredients || post.recipe || post.nutrition?.calories !== undefined) && (
            <p className="mt-1.5 text-xs text-ink-500">
              {[
                (post.ingredients || post.recipe) && `📖 ${t.browse.recipeIncluded}`,
                post.nutrition?.calories !== undefined && `≈${post.nutrition.calories} kcal`,
              ].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      </button>
      <div className="px-4 pb-3.5 flex items-center justify-between">
        <ReactionBar post={post} />
      </div>
    </article>
  );
}
