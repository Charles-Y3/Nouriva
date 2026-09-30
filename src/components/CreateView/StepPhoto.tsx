import { useRef, useState } from 'react';
import type { Draft } from '../../types';
import { useT } from '../../hooks/useT';
import { blobToDataUrl, downscaleImage, saveDraftPhoto, deleteDraftPhoto, getDraftPhoto } from '../../services/localDrafts';
import { identifyFood, AiAssistError } from '../../services/aiService';
import { isAiConsentShown, markAiConsentShown } from '../../services/aiConsent';
import ConsentNotice from '../ConsentNotice';
import NutritionFields from './NutritionFields';

export default function StepPhoto({
  draft,
  update,
  onNext,
}: {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  onNext: () => void;
}) {
  const t = useT();
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [identifying, setIdentifying] = useState(false);
  const [identifyError, setIdentifyError] = useState<string | null>(null);
  const [showConsent, setShowConsent] = useState(!isAiConsentShown());

  async function onFileChosen(file: File) {
    setBusy(true);
    setError(null);
    try {
      const downscaled = await downscaleImage(file, 1600);
      const photoDraftId = await saveDraftPhoto(downscaled);
      const preview = await blobToDataUrl(downscaled);
      if (draft.photoDraftId) {
        deleteDraftPhoto(draft.photoDraftId).catch(() => {});
      }
      update({ photoDraftId, photoPreviewDataUrl: preview });
    } catch {
      setError(t.create.photo.error);
    } finally {
      setBusy(false);
    }
  }

  function removePhoto() {
    if (draft.photoDraftId) {
      deleteDraftPhoto(draft.photoDraftId).catch(() => {});
    }
    update({ photoDraftId: undefined, photoPreviewDataUrl: undefined });
  }

  async function runIdentify() {
    if (!draft.photoDraftId) return;
    markAiConsentShown();
    setShowConsent(false);
    setIdentifying(true);
    setIdentifyError(null);
    try {
      const blob = await getDraftPhoto(draft.photoDraftId);
      if (!blob) throw new Error('Photo not found');
      const dataUrl = await blobToDataUrl(blob);
      const result = await identifyFood(dataUrl, blob.type || 'image/jpeg');
      // Fills dish name/ingredients/recipe/nutrition together — the next
      // step (dish name) already shows these pre-filled and editable, and
      // reflection is deliberately left untouched: that's the one field
      // that has to stay the author's own words, never AI-written.
      update({
        dishName: result.dishName || draft.dishName,
        ingredients: result.ingredients || draft.ingredients,
        recipe: result.recipe || draft.recipe,
        nutrition: result.nutrition,
      });
    } catch (err) {
      // An 'unknown' failure is most often a provider rejecting the image
      // (text-only model), so point at the model rather than a bare failure.
      setIdentifyError(
        err instanceof AiAssistError && err.reason === 'no_api_key' ? t.aiAssist.noKey
        : err instanceof AiAssistError && err.reason === 'unknown' ? t.create.photo.visionFailed
        : t.aiAssist.failed
      );
    } finally {
      setIdentifying(false);
    }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-ink-900 mb-1">{t.create.photo.title}</h2>
      <p className="text-sm text-ink-500 mb-4">{t.create.photo.subtitle}</p>

      {draft.photoPreviewDataUrl ? (
        <div className="relative">
          <img src={draft.photoPreviewDataUrl} alt="" className="w-full rounded-2xl object-cover max-h-72" />
          <button
            type="button"
            onClick={removePhoto}
            className="absolute top-2 right-2 bg-linen-50/90 text-ink-900 rounded-full px-3 py-1 text-xs"
          >
            {t.create.photo.remove}
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => galleryInputRef.current?.click()}
            className="flex-1 border-2 border-dashed border-linen-300 rounded-2xl py-12 text-ink-500 hover:border-clay-500 hover:text-clay-700 transition-colors"
          >
            {busy ? t.create.photo.processing : t.create.photo.choose}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => cameraInputRef.current?.click()}
            className="flex-1 border-2 border-dashed border-linen-300 rounded-2xl py-12 text-ink-500 hover:border-clay-500 hover:text-clay-700 transition-colors"
          >
            {t.create.photo.takePhoto}
          </button>
        </div>
      )}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) onFileChosen(file);
          e.target.value = '';
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) onFileChosen(file);
          e.target.value = '';
        }}
      />
      {error && <p className="mt-2 text-sm text-clay-700">{error}</p>}

      {draft.photoPreviewDataUrl && !draft.dishName && (
        <div className="mt-3 space-y-2">
          {showConsent && <ConsentNotice onDismiss={() => { markAiConsentShown(); setShowConsent(false); }} />}
          <button
            type="button"
            disabled={identifying}
            onClick={runIdentify}
            className="text-xs bg-linen-100 border border-linen-200 rounded-full px-3 py-1.5 text-ink-700 hover:border-sage-400 disabled:opacity-50"
          >
            {identifying ? t.create.photo.identifying : t.create.photo.identifyButton}
          </button>
          {identifyError && <p className="text-xs text-clay-700">{identifyError}</p>}
        </div>
      )}

      {draft.nutrition && (
        <NutritionFields
          nutrition={draft.nutrition}
          onChange={patch => update({ nutrition: { ...draft.nutrition!, ...patch } })}
          onClear={() => update({ nutrition: undefined })}
        />
      )}

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={onNext}
          className="bg-clay-600 hover:bg-clay-700 text-linen-50 rounded-full px-6 py-2.5 text-sm font-medium"
        >
          {draft.photoPreviewDataUrl ? t.common.next : t.common.skip}
        </button>
      </div>
    </div>
  );
}
