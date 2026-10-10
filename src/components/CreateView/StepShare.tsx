import { useState } from 'react';
import type { Draft } from '../../types';
import { useApp } from '../../context/AppContext';
import { useT } from '../../hooks/useT';
import { isSupabaseConfigured } from '../../services/supabase';
import { createPost, ShareError } from '../../services/postsApi';
import { editPost } from '../../services/ownerApi';
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
  const { markPublished, deleteDraft } = useApp();
  const t = useT();
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set when the post is waiting for the admin's review: shown instead of leaving at once.
  const [waiting, setWaiting] = useState(false);

  async function share() {
    setPublishing(true);
    setError(null);
    try {
      // A newly chosen photo is uploaded; otherwise an edit keeps the
      // existing remote one (the draft preview is that https URL).
      let photoUrl: string | undefined;
      if (draft.photoDraftId) {
        const blob = await getDraftPhoto(draft.photoDraftId);
        if (blob) {
          photoUrl = await uploadPhoto(blob);
        }
      } else if (draft.photoPreviewDataUrl?.startsWith('https://')) {
        photoUrl = draft.photoPreviewDataUrl;
      }

      const content = {
        dishName: draft.dishName,
        ingredients: draft.ingredients,
        recipe: draft.recipe,
        reflection: draft.reflection,
        spiritTags: draft.spiritTags,
        category: draft.category,
        nutrition: draft.nutrition,
        photoUrl,
      };

      if (isEdit) {
        const state = await editPost(draft.sharedPostId!, draft.sharedPostKey!, content);
        if (draft.photoDraftId) deleteDraftPhoto(draft.photoDraftId).catch(() => {});
        deleteDraft(draft.id);
        if (state === 'pending') return setWaiting(true);
      } else {
        const { id, key, state } = await createPost(content);
        if (draft.photoDraftId) deleteDraftPhoto(draft.photoDraftId).catch(() => {});
        markPublished(draft.id, id, key);
        if (state === 'pending') return setWaiting(true);
      }
      onDone();
    } catch (err: any) {
      const code = err instanceof ShareError ? err.code : undefined;
      setError(
        code === 'rate_limit' ? t.create.share.rateLimited
        : code === 'duplicate' ? t.create.share.duplicate
        : code === 'blocked' ? t.create.share.blockedContent
        : code === 'removed' ? t.create.share.removedByModerator
        : code === 'unavailable' ? t.create.share.editUnavailable
        : t.create.share.error
      );
    } finally {
      setPublishing(false);
    }
  }

  const isEdit = Boolean(draft.sharedPostId && draft.sharedPostKey);
  const configured = isSupabaseConfigured();
  const blocked = containsBlockedContent(draft.dishName, draft.reflection, draft.ingredients, draft.recipe);

  if (waiting) {
    return (
      <div className="text-center py-10">
        <p className="text-lg font-semibold text-ink-900">{t.create.share.waitingTitle}</p>
        <p className="mt-2 text-sm text-ink-500">{t.create.share.waitingBody}</p>
        <button type="button" onClick={onDone} className="mt-6 bg-clay-600 hover:bg-clay-700 text-linen-50 rounded-full px-6 py-2.5 text-sm font-medium">
          {t.common.ok}
        </button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-ink-900 mb-1">{t.create.share.title}</h2>
      <p className="text-sm text-ink-500 mb-4">{isEdit ? t.create.share.editingSubtitle : t.create.share.subtitle}</p>

      <div className="bg-linen-100 border border-linen-200 rounded-2xl overflow-hidden">
        {draft.photoPreviewDataUrl && (
          <img src={draft.photoPreviewDataUrl} alt="" className="w-full aspect-[4/3] object-cover" />
        )}
        <div className="p-4">
          <h3 className="font-semibold text-ink-900">{draft.dishName}</h3>
          {draft.category && <p className="text-xs text-ink-500 mt-0.5">{t.categories[draft.category] || draft.category}</p>}
          <p className="mt-2 text-[15px] italic text-ink-700">"{draft.reflection}"</p>
          {draft.spiritTags.length > 0 && (
            <p className="mt-2 text-sm text-sage-600">✨ {draft.spiritTags.map(tag => t.spiritTags[tag] || tag).join(' · ')}</p>
          )}
          {draft.nutrition?.calories !== undefined && (
            <p className="mt-1.5 text-xs text-ink-500">≈{draft.nutrition.calories} kcal</p>
          )}
        </div>
      </div>

      <p className="mt-4 text-xs text-ink-500">{isEdit ? t.create.share.translationNoteEdit : t.create.share.translationNote}</p>
      {!isEdit && <p className="mt-2 text-xs text-ink-500">{t.create.share.irreversibleNote}</p>}

      {!configured && <p className="mt-2 text-sm text-clay-700">{t.create.share.notConfigured}</p>}
      {!draft.category && <p className="mt-2 text-sm text-clay-700">{t.create.dishName.categoryRequired}</p>}
      {blocked && <p className="mt-2 text-sm text-clay-700">{t.create.share.blockedContent}</p>}
      {error && <p className="mt-4 text-sm text-clay-700">{error}</p>}

      <div className="mt-6 flex justify-between items-center">
        <button type="button" onClick={onBack} className="text-sm text-ink-500 hover:text-ink-900 px-2 py-2.5">
          {t.common.back}
        </button>
        <div className="flex items-center gap-3">
          {!publishing && (
            // The draft is already saved on every field edit (see
            // CreateView's update()) — this button is really just a clear,
            // discoverable "I'm done for now, don't publish" exit rather
            // than new persistence logic.
            <button type="button" onClick={onDone} className="text-sm text-ink-500 hover:text-ink-900 underline">
              {t.create.share.saveForLater}
            </button>
          )}
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
              label={isEdit ? t.create.share.updateButton : t.create.share.shareButton}
              prompt={isEdit ? t.create.share.updateConfirmPrompt : t.create.share.shareConfirmPrompt}
              onConfirm={share}
              disabled={!configured || blocked || !draft.category || !draft.ingredients?.trim() || !draft.recipe?.trim() || draft.spiritTags.length === 0 || !draft.reflection.trim()}
              className="bg-clay-600 hover:bg-clay-700 disabled:opacity-50 text-linen-50 rounded-full px-6 py-2.5 text-sm font-medium"
            />
          )}
        </div>
      </div>
    </div>
  );
}
