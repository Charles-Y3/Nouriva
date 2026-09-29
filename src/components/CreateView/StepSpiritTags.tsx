import type { Draft } from '../../types';
import { useT } from '../../hooks/useT';
import SpiritTagPicker from '../SpiritTagPicker';
import AiAssistBar from './AiAssistBar';

export default function StepSpiritTags({
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

  function toggle(tag: string) {
    update({
      spiritTags: draft.spiritTags.includes(tag)
        ? draft.spiritTags.filter(tg => tg !== tag)
        : [...draft.spiritTags, tag],
    });
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-ink-900 mb-1">{t.create.tags.title}</h2>
      <p className="text-sm text-ink-500 mb-4">{t.create.tags.subtitle}</p>

      <SpiritTagPicker selected={draft.spiritTags} onToggle={toggle} />

      <AiAssistBar
        text={draft.reflection}
        onTags={tags => update({ spiritTags: [...new Set([...draft.spiritTags, ...tags])] })}
      />

      <div className="mt-6 flex justify-between">
        <button type="button" onClick={onBack} className="text-sm text-ink-500 hover:text-ink-900 px-2 py-2.5">
          {t.common.back}
        </button>
        <button
          type="button"
          onClick={onNext}
          className="bg-clay-600 hover:bg-clay-700 text-linen-50 rounded-full px-6 py-2.5 text-sm font-medium"
        >
          {t.common.next}
        </button>
      </div>
    </div>
  );
}
