import { useT } from '../../hooks/useT';
import type { NutritionEstimate } from '../../types';

export default function NutritionFields({
  nutrition,
  onChange,
  onClear,
}: {
  nutrition: NutritionEstimate;
  onChange: (patch: Partial<NutritionEstimate>) => void;
  onClear: () => void;
}) {
  const t = useT();

  function numField(key: keyof NutritionEstimate, label: string) {
    return (
      <label className="flex items-center justify-between gap-2 text-sm text-ink-700">
        {label}
        <input
          type="number"
          min={0}
          value={nutrition[key] as number | undefined ?? ''}
          onChange={e => onChange({ [key]: e.target.value === '' ? undefined : Number(e.target.value) })}
          className="w-24 rounded-lg border border-linen-200 bg-linen-50 px-2 py-1 text-right"
        />
      </label>
    );
  }

  return (
    <div className="mt-3 bg-linen-100 border border-linen-200 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide">{t.create.photo.nutritionHeading}</p>
        <button type="button" onClick={onClear} className="text-xs text-clay-700 hover:text-clay-600 underline">
          {t.create.photo.clearNutrition}
        </button>
      </div>
      {nutrition.isAiEstimate && <p className="text-xs text-ink-500">{t.create.photo.nutritionNote}</p>}
      {numField('calories', t.create.photo.calories)}
      {numField('carbsGrams', t.create.photo.carbs)}
      {numField('proteinGrams', t.create.photo.protein)}
      {numField('fatGrams', t.create.photo.fat)}
      {numField('fiberGrams', t.create.photo.fiber)}
    </div>
  );
}
