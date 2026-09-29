import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useT } from '../hooks/useT';
import type { Language } from '../types';
import { enableFolderBackup, isFolderBackupSupported } from '../utils/folderBackup';

const LANGUAGES: { id: Language; label: string }[] = [
  { id: 'zh-Hant', label: '繁體中文' },
  { id: 'zh-Hans', label: '简体中文' },
  { id: 'en', label: 'English' },
];

export default function OnboardingModal() {
  const { updatePreferences } = useApp();
  const t = useT();
  const [step, setStep] = useState(0);
  const [folderStatus, setFolderStatus] = useState<'idle' | 'enabled' | 'error'>('idle');

  function chooseLanguage(lang: Language) {
    updatePreferences({ language: lang });
    setStep(1);
  }

  function finish() {
    updatePreferences({ completedIntro: true });
  }

  async function tryEnableFolder() {
    try {
      await enableFolderBackup();
      setFolderStatus('enabled');
    } catch (err: any) {
      if (err?.name !== 'AbortError') setFolderStatus('error');
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink-900/40 flex items-center justify-center p-4">
      <div className="bg-linen-50 rounded-2xl max-w-sm w-full p-6 shadow-xl">
        {step === 0 && (
          <>
            <h2 className="text-lg font-semibold text-ink-900 mb-4">{t.onboarding.languageStepTitle}</h2>
            <div className="space-y-2">
              {LANGUAGES.map(l => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => chooseLanguage(l.id)}
                  className="w-full text-left bg-linen-100 hover:bg-linen-200 border border-linen-200 rounded-xl px-4 py-3 text-base text-ink-900"
                >
                  {l.label}
                </button>
              ))}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h2 className="text-lg font-semibold text-ink-900 mb-2">{t.onboarding.folderStepTitle}</h2>
            {isFolderBackupSupported() ? (
              <>
                <p className="text-sm text-ink-500 mb-4">{t.onboarding.folderStepBody}</p>
                {folderStatus === 'enabled' ? (
                  <p className="text-sm text-sage-600 mb-4">✓</p>
                ) : (
                  <button
                    type="button"
                    onClick={tryEnableFolder}
                    className="w-full bg-linen-100 hover:bg-linen-200 border border-linen-200 rounded-xl px-4 py-3 text-sm text-ink-900 mb-3"
                  >
                    {t.onboarding.enableButton}
                  </button>
                )}
              </>
            ) : (
              <p className="text-sm text-ink-500 mb-4">{t.settings.folderBackupUnsupported}</p>
            )}
            <button
              type="button"
              onClick={finish}
              className="w-full bg-clay-600 hover:bg-clay-700 text-linen-50 rounded-full px-4 py-2.5 text-sm font-medium"
            >
              {t.onboarding.finishButton}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
