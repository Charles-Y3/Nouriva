import { useEffect, useState } from 'react';
import { useT } from '../hooks/useT';

// Dual update-detection, ported from living-in-harmony's UpdateToast.tsx:
// (1) 'controllerchange' fires when a new service worker takes control —
// only treated as a real update signal if a controller already existed at
// mount (so it doesn't fire on first-ever install). (2) Most deploys don't
// change sw.js's bytes at all, so (1) alone misses most of them — polling
// /version.json (written by vite.config.ts's versionFilePlugin) every 15
// minutes and on tab-visible catches those too.
export default function UpdateToast() {
  const t = useT();
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const hadControllerAtLoad = Boolean(navigator.serviceWorker?.controller);
    const onControllerChange = () => {
      if (hadControllerAtLoad) setAvailable(true);
    };
    navigator.serviceWorker?.addEventListener('controllerchange', onControllerChange);

    const checkVersion = () => {
      fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
        .then(res => (res.ok ? res.json() : null))
        .then(data => {
          if (data?.buildId && typeof __APP_BUILD_ID__ !== 'undefined' && data.buildId !== __APP_BUILD_ID__) {
            setAvailable(true);
          }
        })
        .catch(() => {});
    };
    checkVersion();
    const interval = setInterval(checkVersion, 15 * 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkVersion();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      navigator.serviceWorker?.removeEventListener('controllerchange', onControllerChange);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!available) return null;

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-20 bg-ink-900 text-linen-50 rounded-full px-4 py-2 text-sm flex items-center gap-3 shadow-lg">
      <span>{t.update.available}</span>
      <button type="button" onClick={() => window.location.reload()} className="underline font-medium">
        {t.update.reload}
      </button>
      <button type="button" onClick={() => setAvailable(false)} className="text-linen-200">
        {t.update.dismiss}
      </button>
    </div>
  );
}
