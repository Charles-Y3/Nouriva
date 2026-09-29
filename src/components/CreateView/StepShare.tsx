import { useState } from 'react';
import type { Draft } from '../../types';
import { useApp } from '../../context/AppContext';
import { useT } from '../../hooks/useT';
import { isSupabaseConfigured } from '../../services/supabase';
import { createPost } from '../../services/postsApi';
import { uploadPhoto } from '../../services/photoUpload';
import { deleteDraftPhoto, getDraftPhoto } from '../../services/localDrafts';
import { containsBlockedContent } from '../../utils/contentFilter';
import ConfirmButton from '../ConfirmButton';

export default function StepShare({
  draft,
  onBack,
  onDone,
}: {
  draft: Draft;
  onBack: () => void;
  onDone: () => void;
}) {
  const { markPublished } = useApp();
  const t = useT();
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function share() {
    setPublishing(true);
    setError(null);
    try {
      let photoUrl: string | undefined;
      if (draft.photoDraftId) {
        const blob = await getDraftPhoto(draft.photoDraftId);
        if (blob) {
          photoUrl = await uploadPhoto(blob);
        }
      }

      const post = await createPost({
        dishName: draft.dishName,
        ingredients: draft.ingredients,
        recipe: draft.recipe,
        reflection: draft.reflection,
        spiritTags: draft.spiritTags,
        nutrition: draft.nutrition,
        photoUrl,
      });

      if (draft.photoDraftId) {
        deleteDraftPhoto(draft.photoDraftId).catch(() => {});
      }
      markPublished(draft.id, post.id);
      onDone();
    } catch (err: any) {
      setError(err?.message || t.create.share.error);
    } finally {
      setPublishing(false);
    }
  }

  const configured = isSupabaseConfigured();
  const blocked = containsBlockedContent(draft.dishName, draft.reflection, draft.ingredients, draft.recipe);

  return (
    <div>
      <h2 className="text-lg font-semibold text-ink-900 mb-1">{t.create.share.title}</h2>
      <p className="text-sm text-ink-500 mb-4">{t.create.share.subtitle}</p>

      <div className="bg-linen-100 border border-linen-200 rounded-2xl overflow-hidden">
        {draft.photoPreviewDataUrl && (
          <img src={draft.photoPreviewDataUrl} alt="" className="w-full aspect-[4/3] object-cover" />
        )}
        <div className="p-4">
          <h3 className="font-semibold text-ink-900">{draft.dishName}</h3>
          <p className="mt-2 text-[15px] italic text-ink-700">"{draft.reflection}"</p>
          {draft.spiritTags.length > 0 && (
            <p className="mt-2 text-sm text-sage-600">✨ {draft.spiritTags.map(tag => t.spiritTags[tag] || tag).join(' · ')}</p>
          )}
          {draft.nutrition?.calories !== undefined && (
            <p className="mt-1.5 text-xs text-ink-500">≈{draft.nutrition.calories} kcal</p>
          )}
        </div>
      </div>

      <p className="mt-4 text-xs text-ink-500">{t.create.share.irreversibleNote}</p>

      {!configured && <p className="mt-2 text-sm text-clay-700">{t.create.share.notConfigured}</p>}
      {blocked && <p className="mt-2 text-sm text-clay-700">{t.create.share.blockedContent}</p>}
      {error && <p className="mt-4 text-sm text-clay-700">{error}</p>}

      <div className="mt-6 flex justify-between items-center">
        <button type="button" onClick={onBack} className="text-sm text-ink-500 hover:text-ink-900 px-2 py-2.5">
          {t.common.back}
        </button>
        {publishing ? (
          <button
            type="button"
            disabled
            className="bg-clay-600 opacity-50 text-linen-50 rounded-full px-6 py-2.5 text-sm font-medium"
          >
            {t.create.share.sharing}
          </button>
        ) : (
          <ConfirmButton
            label={t.create.share.shareButton}
            prompt={t.create.share.shareConfirmPrompt}
            onConfirm={share}
            disabled={!configured || blocked}
            className="bg-clay-600 hover:bg-clay-700 disabled:opacity-50 text-linen-50 rounded-full px-6 py-2.5 text-sm font-medium"
          />
        )}
      </div>
    </div>
  );
}
