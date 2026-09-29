import { useEffect, useState } from 'react';

// Captures the browser's install prompt so a real Settings button can
// trigger it (Chrome/Edge/Android only fire beforeinstallprompt once, and
// only in response to a later user gesture). iOS Safari never fires this
// event at all, so isIOS lets the caller show manual "Add to Home Screen"
// instructions instead of a dead button.
export function useInstallPrompt() {
  const [deferredEvent, setDeferredEvent] = useState<any>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredEvent(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredEvent(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const isStandalone =
    (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches) ||
    (typeof navigator !== 'undefined' && (navigator as any).standalone === true);

  const isIOS = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

  async function promptInstall(): Promise<void> {
    if (!deferredEvent) return;
    deferredEvent.prompt();
    await deferredEvent.userChoice;
    setDeferredEvent(null);
  }

  return {
    canInstall: Boolean(deferredEvent),
    isInstalled: installed || isStandalone,
    isIOS,
    promptInstall,
  };
}
