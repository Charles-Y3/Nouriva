import { useT } from '../hooks/useT';

export default function ConsentNotice({ onDismiss }: { onDismiss: () => void }) {
  const t = useT();
  return (
    <div className="bg-sage-500/10 border border-sage-500/30 rounded-xl p-3 text-sm text-ink-700 flex items-start justify-between gap-3">
      <p>{t.aiAssist.consent}</p>
      <button type="button" onClick={onDismiss} className="text-ink-500 hover:text-ink-900 shrink-0">
        ✕
      </button>
    </div>
  );
}
