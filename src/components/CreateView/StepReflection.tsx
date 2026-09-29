import type { Draft } from '../../types';
import { useT } from '../../hooks/useT';
import AiAssistBar from './AiAssistBar';

export default function StepReflection({
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
  return (
    <div>
      <h2 className="text-lg font-semibold text-ink-900 mb-1">{t.create.reflection.title}</h2>
      <p className="text-sm text-ink-500 mb-4">{t.create.reflection.subtitle}</p>
      <textarea
        autoFocus
        value={draft.reflection}
        onChange={e => update({ reflection: e.target.value })}
        placeholder={t.create.reflection.placeholder}
        rows={6}
        maxLength={4000}
        className="w-full rounded-xl border border-linen-200 bg-linen-100 px-4 py-3 text-base text-ink-900 placeholder:text-ink-500/60 leading-relaxed"
      />

      <AiAssistBar
        text={draft.reflection}
        onImproved={result => update({ reflection: result })}
        onExpressed={result => update({ reflection: result })}
      />

      <div className="mt-6 flex justify-between">
        <button type="button" onClick={onBack} className="text-sm text-ink-500 hover:text-ink-900 px-2 py-2.5">
          {t.common.back}
        </button>
        <button
          type="button"
          disabled={!draft.reflection.trim()}
          onClick={onNext}
          className="bg-clay-600 hover:bg-clay-700 disabled:opacity-50 text-linen-50 rounded-full px-6 py-2.5 text-sm font-medium"
        >
          {t.common.next}
        </button>
      </div>
    </div>
  );
}
