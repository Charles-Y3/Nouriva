import { useT } from '../hooks/useT';
import { useApp } from '../context/AppContext';
import { FONT_SIZES } from '../types';

export default function Header({ onOpenSettings, settingsActive }: { onOpenSettings: () => void; settingsActive: boolean }) {
  const t = useT();
  const { preferences, updatePreferences } = useApp();

  const sizeIndex = FONT_SIZES.indexOf(preferences.fontSize);

  function step(delta: number) {
    const next = FONT_SIZES[Math.min(FONT_SIZES.length - 1, Math.max(0, sizeIndex + delta))];
    updatePreferences({ fontSize: next });
  }

  return (
    <header className="border-b border-linen-200 bg-linen-50/95 backdrop-blur sticky top-0 z-10">
      <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <img src="/favicon-64.png" alt="" width="24" height="24" className="rounded-full" aria-hidden="true" />
          <span className="text-lg font-semibold tracking-tight text-ink-900">{t.appName}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={sizeIndex === 0}
            aria-label={t.common.decreaseFontSize}
            className="w-7 h-7 flex items-center justify-center rounded-full border border-linen-200 text-ink-700 text-xs hover:border-sage-400 disabled:opacity-30 disabled:hover:border-linen-200"
          >
            A<span className="text-[9px] align-top">−</span>
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={sizeIndex === FONT_SIZES.length - 1}
            aria-label={t.common.increaseFontSize}
            className="w-7 h-7 flex items-center justify-center rounded-full border border-linen-200 text-ink-700 text-sm hover:border-sage-400 disabled:opacity-30 disabled:hover:border-linen-200"
          >
            A<span className="text-[10px] align-top">+</span>
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label={t.common.openSettings}
            title={t.common.openSettings}
            className={`w-7 h-7 ml-1 flex items-center justify-center rounded-full border text-base transition-colors ${
              settingsActive ? 'border-clay-600 text-clay-700' : 'border-linen-200 text-ink-700 hover:border-sage-400'
            }`}
          >
            ⚙︎
          </button>
        </div>
      </div>
    </header>
  );
}
