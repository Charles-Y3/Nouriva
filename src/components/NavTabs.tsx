import type { NavTab } from '../types';
import { useT } from '../hooks/useT';

export default function NavTabs({ current, onChange }: { current: NavTab; onChange: (tab: NavTab) => void }) {
  const t = useT();
  const TABS: { id: NavTab; label: string; icon: string }[] = [
    { id: 'browse', label: t.nav.browse, icon: '✧' },
    { id: 'create', label: t.nav.create, icon: '+' },
    { id: 'my-nouriva', label: t.nav.myNouriva, icon: '☺' },
    { id: 'settings', label: t.nav.settings, icon: '⚙' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-linen-50/95 backdrop-blur border-t border-linen-200 z-10">
      <div className="max-w-3xl mx-auto grid grid-cols-4">
        {TABS.map(tb => {
          const active = current === tb.id;
          return (
            <button
              key={tb.id}
              onClick={() => onChange(tb.id)}
              className={`flex flex-col items-center gap-0.5 py-2.5 text-xs transition-colors ${
                active ? 'text-clay-700' : 'text-ink-500 hover:text-ink-700'
              }`}
            >
              <span className={`text-lg leading-none ${active ? '' : 'opacity-70'}`}>{tb.icon}</span>
              {tb.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
