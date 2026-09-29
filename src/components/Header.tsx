import { useT } from '../hooks/useT';

export default function Header() {
  const t = useT();
  return (
    <header className="border-b border-linen-200 bg-linen-50/95 backdrop-blur sticky top-0 z-10">
      <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-2">
        <img src="/favicon-64.png" alt="" width="24" height="24" className="rounded-full" aria-hidden="true" />
        <span className="text-lg font-semibold tracking-tight text-ink-900">{t.appName}</span>
      </div>
    </header>
  );
}
