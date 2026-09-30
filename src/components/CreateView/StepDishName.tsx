import { useState } from 'react';
import { CATEGORIES } from '../../types';
import type { Draft } from '../../types';
import { useT } from '../../hooks/useT';

export default function StepDishName({
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
  const [showMore, setShowMore] = useState(Boolean(draft.ingredients || draft.recipe));

  return (
    <div>
      <h2 className="text-lg font-semibold text-ink-900 mb-1">{t.create.dishName.title}</h2>
      <p className="text-sm text-ink-500 mb-4">{t.create.dishName.subtitle}</p>
      <input
        autoFocus
        value={draft.dishName}
        onChange={e => update({ dishName: e.target.value })}
        placeholder={t.create.dishName.placeholder}
        maxLength={120}
        className="w-full rounded-xl border border-linen-200 bg-linen-100 px-4 py-3 text-base text-ink-900 placeholder:text-ink-500/60"
      />

      <label className="mt-4 block text-sm text-ink-500">
        {t.create.dishName.categoryLabel}
        <select
          value={draft.category ?? ''}
          onChange={e => update({ category: e.target.value || undefined })}
          className="mt-1 w-full rounded-xl border border-linen-200 bg-linen-100 px-4 py-2.5 text-sm text-ink-900"
        >
          <option value="">{t.create.dishName.categoryPlaceholder}</option>
          {CATEGORIES.map(c => (
            <option key={c} value={c}>{t.categories[c]}</option>
          ))}
        </select>
      </label>

      {showMore ? (
        <div className="mt-4 space-y-3">
          <textarea
            value={draft.ingredients || ''}
            onChange={e => update({ ingredients: e.target.value })}
            placeholder={t.create.dishName.ingredientsPlaceholder}
            rows={2}
            maxLength={4000}
            className="w-full rounded-xl border border-linen-200 bg-linen-100 px-4 py-2.5 text-sm"
          />
          <textarea
            value={draft.recipe || ''}
            onChange={e => update({ recipe: e.target.value })}
            placeholder={t.create.dishName.recipePlaceholder}
            rows={2}
            maxLength={4000}
            className="w-full rounded-xl border border-linen-200 bg-linen-100 px-4 py-2.5 text-sm"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowMore(true)}
          className="mt-3 text-sm text-clay-700 hover:text-clay-600 underline"
        >
          {t.create.dishName.addMore}
        </button>
      )}

      <div className="mt-6 flex justify-between">
        <button type="button" onClick={onBack} className="text-sm text-ink-500 hover:text-ink-900 px-2 py-2.5">
          {t.common.back}
        </button>
        <button
          type="button"
          disabled={!draft.dishName.trim()}
          onClick={onNext}
          className="bg-clay-600 hover:bg-clay-700 disabled:opacity-50 text-linen-50 rounded-full px-6 py-2.5 text-sm font-medium"
        >
          {t.common.next}
        </button>
      </div>
    </div>
  );
}
