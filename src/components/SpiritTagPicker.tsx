import { SPIRIT_TAGS } from '../types';
import { useT } from '../hooks/useT';

export default function SpiritTagPicker({
  selected,
  onToggle,
  small = false,
}: {
  selected: string[];
  onToggle: (tag: string) => void;
  small?: boolean;
}) {
  const t = useT();
  return (
    <div className="flex flex-wrap gap-2">
      {SPIRIT_TAGS.map(tag => {
        const active = selected.includes(tag);
        return (
          <button
            key={tag}
            type="button"
            onClick={() => onToggle(tag)}
            className={`rounded-full border transition-colors ${small ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm'} ${
              active
                ? 'bg-sage-500 border-sage-500 text-linen-50'
                : 'bg-linen-100 border-linen-200 text-ink-700 hover:border-sage-400'
            }`}
          >
            {t.spiritTags[tag]}
          </button>
        );
      })}
    </div>
  );
}
