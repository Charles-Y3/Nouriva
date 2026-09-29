import { useRef, useState } from 'react';
import type { Draft } from '../../types';
import { useT } from '../../hooks/useT';
import { blobToDataUrl, downscaleImage, saveDraftPhoto, deleteDraftPhoto, getDraftPhoto } from '../../services/localDrafts';
import { estimateNutrition, AiAssistError } from '../../services/aiService';
import { isAiConsentShown, markAiConsentShown } from '../../services/aiConsent';
import ConsentNotice from '../ConsentNotice';
import NutritionFields from './NutritionFields';

export default function StepPhoto({
  draft,
  update,
  onNext,
  onBack,
}: {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);
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

  async function runEstimate() {
    if (!draft.photoDraftId) return;
    markAiConsentShown();
    setShowConsent(false);
    setEstimating(true);
    setEstimateError(null);
    try {
      const blob = await getDraftPhoto(draft.photoDraftId);
      if (!blob) throw new Error('Photo not found');
      const dataUrl = await blobToDataUrl(blob);
      const result = await estimateNutrition(dataUrl, blob.type || 'image/jpeg');
      update({ nutrition: result });
    } catch (err) {
      setEstimateError(err instanceof AiAssistError && err.reason === 'no_api_key' ? t.aiAssist.noKey : t.aiAssist.failed);
    } finally {
      setEstimating(false);
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
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="w-full border-2 border-dashed border-linen-300 rounded-2xl py-12 text-ink-500 hover:border-clay-500 hover:text-clay-700 transition-colors"
        >
          {busy ? t.create.photo.processing : t.create.photo.choose}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) onFileChosen(file);
          e.target.value = '';
        }}
      />
      {error && <p className="mt-2 text-sm text-clay-700">{error}</p>}

      {draft.photoPreviewDataUrl && !draft.nutrition && (
        <div className="mt-3 space-y-2">
          {showConsent && <ConsentNotice onDismiss={() => { markAiConsentShown(); setShowConsent(false); }} />}
          <button
            type="button"
            disabled={estimating}
            onClick={runEstimate}
            className="text-xs bg-linen-100 border border-linen-200 rounded-full px-3 py-1.5 text-ink-700 hover:border-sage-400 disabled:opacity-50"
          >
            {estimating ? t.create.photo.estimating : t.create.photo.estimateNutrition}
          </button>
          {estimateError && <p className="text-xs text-clay-700">{estimateError}</p>}
        </div>
      )}

      {draft.nutrition && (
        <NutritionFields
          nutrition={draft.nutrition}
          onChange={patch => update({ nutrition: { ...draft.nutrition!, ...patch } })}
          onClear={() => update({ nutrition: undefined })}
        />
      )}

      <div className="mt-6 flex justify-between">
        <button type="button" onClick={onBack} className="text-sm text-ink-500 hover:text-ink-900 px-2 py-2.5">
          {t.common.back}
        </button>
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
