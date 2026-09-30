import { useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useT } from '../hooks/useT';
import { useAiProviderManager } from '../hooks/useAiProviderManager';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import type { Language } from '../types';

const DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
import ConfirmButton from './ConfirmButton';
import { downloadBackup, readBackupFile } from '../utils/backup';
import { markBackedUp } from '../utils/backupReminder';
import {
  disableFolderBackup,
  enableFolderBackup,
  getFolderBackupName,
  importFromFolder,
  isFolderBackupEnabled,
  isFolderBackupSupported,
} from '../utils/folderBackup';

const LANGUAGES: { id: Language; label: string }[] = [
  { id: 'zh-Hant', label: '繁體中文' },
  { id: 'zh-Hans', label: '简体中文' },
  { id: 'en', label: 'English' },
];

export default function SettingsView() {
  const { preferences, updatePreferences, drafts, applyBackup, resetAllLocalData } = useApp();
  const t = useT();
  const { isLocked, isUnlocked, saveProvider, unlockProvider, clearProvider } = useAiProviderManager();
  const { canInstall, isInstalled, isIOS, promptInstall } = useInstallPrompt();

  const [rawBaseUrl, setRawBaseUrl] = useState(DEFAULT_BASE_URL);
  const [rawApiKey, setRawApiKey] = useState('');
  const [rawModel, setRawModel] = useState(DEFAULT_MODEL);
  const [passphrase, setPassphrase] = useState('');
  const [unlockPassphrase, setUnlockPassphrase] = useState('');
  const [unlockError, setUnlockError] = useState(false);
  const [folderEnabled, setFolderEnabled] = useState(isFolderBackupEnabled());
  const [folderName, setFolderName] = useState(getFolderBackupName());
  const [folderMessage, setFolderMessage] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  async function handleEnableFolder() {
    try {
      const name = await enableFolderBackup();
      setFolderEnabled(true);
      setFolderName(name);
      markBackedUp();
    } catch (err: any) {
      if (err?.name !== 'AbortError') setFolderMessage('error');
    }
  }

  function handleDisableFolder() {
    disableFolderBackup();
    setFolderEnabled(false);
    setFolderName(null);
  }

  async function handleRestoreFromFolder() {
    try {
      const backup = await importFromFolder();
      applyBackup(backup);
      setFolderEnabled(true);
      setFolderName(getFolderBackupName());
      markBackedUp();
    } catch {
      setFolderMessage('error');
    }
  }

  async function handleImportFile(file: File) {
    try {
      const backup = await readBackupFile(file);
      applyBackup(backup);
    } catch {
      // Silently ignored — an invalid file just doesn't apply.
    }
  }

  return (
    <div className="pt-4 space-y-10 pb-8">
      <h1 className="text-xl font-semibold text-ink-900">{t.settings.heading}</h1>

      <section>
        <h2 className="text-sm font-semibold text-ink-500 uppercase tracking-wide mb-2">{t.settings.languageHeading}</h2>
        <div className="flex gap-2">
          {LANGUAGES.map(l => (
            <button
              key={l.id}
              type="button"
              onClick={() => updatePreferences({ language: l.id })}
              className={`rounded-full px-3.5 py-1.5 text-sm border transition-colors ${
                preferences.language === l.id
                  ? 'bg-clay-600 border-clay-600 text-linen-50'
                  : 'bg-linen-100 border-linen-200 text-ink-700'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-ink-500 uppercase tracking-wide mb-2">{t.settings.aiHeading}</h2>
        <p className="text-sm text-ink-500 mb-2">{t.settings.aiBody}</p>
        <a
          href="https://console.groq.com/keys"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-clay-700 hover:text-clay-600 underline inline-flex items-center gap-1 mb-3"
        >
          {t.settings.getKeyLink}
          <span aria-hidden="true">↗</span>
        </a>

        {isUnlocked ? (
          <div className="bg-linen-100 border border-linen-200 rounded-xl p-4 space-y-2">
            <p className="text-sm text-ink-700">{t.settings.providerUnlocked}</p>
            <p className="text-xs text-ink-500 font-mono break-all">
              {preferences.customAiProvider?.model} · {preferences.customAiProvider?.baseUrl}
            </p>
            <ConfirmButton
              label={t.settings.removeKey}
              prompt={t.settings.removeKeyConfirm}
              onConfirm={clearProvider}
              className="text-sm text-clay-700 hover:text-clay-600 underline"
            />
          </div>
        ) : isLocked ? (
          <div className="bg-linen-100 border border-linen-200 rounded-xl p-4 space-y-2">
            <p className="text-sm text-ink-700">{t.settings.keyLocked}</p>
            <input
              type="password"
              value={unlockPassphrase}
              onChange={e => { setUnlockPassphrase(e.target.value); setUnlockError(false); }}
              placeholder={t.settings.passphrasePlaceholder}
              className="w-full rounded-lg border border-linen-200 bg-linen-50 px-3 py-2 text-sm"
            />
            {unlockError && <p className="text-sm text-clay-700">{t.settings.wrongPassphrase}</p>}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={async () => {
                  const ok = await unlockProvider(unlockPassphrase);
                  setUnlockError(!ok);
                  if (ok) setUnlockPassphrase('');
                }}
                className="bg-clay-600 hover:bg-clay-700 text-linen-50 rounded-full px-4 py-1.5 text-sm"
              >
                {t.settings.unlock}
              </button>
              <ConfirmButton
                label={t.settings.forgetKey}
                prompt={t.settings.removeKeyConfirm}
                onConfirm={clearProvider}
                className="text-sm text-ink-500 underline"
              />
            </div>
          </div>
        ) : (
          <div className="bg-linen-100 border border-linen-200 rounded-xl p-4 space-y-2">
            <label className="block text-xs text-ink-500">
              {t.settings.baseUrlLabel}
              <input
                type="text"
                value={rawBaseUrl}
                onChange={e => setRawBaseUrl(e.target.value)}
                placeholder={DEFAULT_BASE_URL}
                className="mt-1 w-full rounded-lg border border-linen-200 bg-linen-50 px-3 py-2 text-sm font-mono"
              />
            </label>
            <label className="block text-xs text-ink-500">
              {t.settings.modelLabel}
              <input
                type="text"
                value={rawModel}
                onChange={e => setRawModel(e.target.value)}
                placeholder={DEFAULT_MODEL}
                className="mt-1 w-full rounded-lg border border-linen-200 bg-linen-50 px-3 py-2 text-sm font-mono"
              />
            </label>
            <label className="block text-xs text-ink-500">
              {t.settings.apiKeyLabel}
              <input
                type="password"
                value={rawApiKey}
                onChange={e => setRawApiKey(e.target.value)}
                placeholder={t.settings.apiKeyPlaceholder}
                className="mt-1 w-full rounded-lg border border-linen-200 bg-linen-50 px-3 py-2 text-sm"
              />
            </label>
            <input
              type="password"
              value={passphrase}
              onChange={e => setPassphrase(e.target.value)}
              placeholder={t.settings.choosePassphrase}
              className="w-full rounded-lg border border-linen-200 bg-linen-50 px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={!rawApiKey.trim() || !passphrase.trim()}
              onClick={async () => {
                await saveProvider(
                  { baseUrl: rawBaseUrl.trim() || DEFAULT_BASE_URL, apiKey: rawApiKey.trim(), model: rawModel.trim() || DEFAULT_MODEL },
                  passphrase
                );
                setRawApiKey('');
                setPassphrase('');
              }}
              className="bg-clay-600 hover:bg-clay-700 disabled:opacity-50 text-linen-50 rounded-full px-4 py-1.5 text-sm"
            >
              {t.settings.saveKey}
            </button>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-ink-500 uppercase tracking-wide mb-2">{t.settings.installHeading}</h2>
        <div className="bg-linen-100 border border-linen-200 rounded-xl p-4 space-y-2">
          {isInstalled ? (
            <p className="text-sm text-ink-700">{t.settings.installedBody}</p>
          ) : isIOS ? (
            <p className="text-sm text-ink-700">{t.settings.installIosBody}</p>
          ) : canInstall ? (
            <>
              <p className="text-sm text-ink-500">{t.settings.installBody}</p>
              <button
                type="button"
                onClick={promptInstall}
                className="bg-clay-600 hover:bg-clay-700 text-linen-50 rounded-full px-4 py-1.5 text-sm"
              >
                {t.settings.installButton}
              </button>
            </>
          ) : (
            // beforeinstallprompt hasn't fired — Chrome decides that on its
            // own engagement heuristics, which a site can't force, so a
            // disabled button with no explanation would be a dead end.
            // Every Chromium browser still offers install from its own
            // menu regardless of whether this event ever fires.
            <p className="text-sm text-ink-700">{t.settings.installFallbackBody}</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-ink-500 uppercase tracking-wide mb-2">{t.settings.localDataHeading}</h2>
        <div className="bg-linen-100 border border-linen-200 rounded-xl p-4 space-y-3">
          <p className="text-sm text-ink-700">{t.settings.draftsStored(drafts.length)}</p>
          <div className="flex flex-wrap gap-4">
            <button
              type="button"
              onClick={() => { downloadBackup(); markBackedUp(); }}
              className="text-sm text-clay-700 hover:text-clay-600 underline"
            >
              {t.settings.exportDrafts}
            </button>
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              className="text-sm text-clay-700 hover:text-clay-600 underline"
            >
              {t.settings.importDrafts}
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) handleImportFile(file);
                e.target.value = '';
              }}
            />
          </div>

          {isFolderBackupSupported() ? (
            <div className="pt-2 border-t border-linen-200 space-y-2">
              <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide">{t.settings.folderBackupHeading}</p>
              <p className="text-sm text-ink-500">{t.settings.folderBackupBody}</p>
              {folderEnabled && folderName ? (
                <p className="text-sm text-sage-600">{t.settings.folderBackupEnabled(folderName)}</p>
              ) : null}
              <div className="flex flex-wrap gap-4">
                {folderEnabled ? (
                  <ConfirmButton
                    label={t.settings.folderBackupDisable}
                    prompt={t.settings.folderBackupDisableConfirm}
                    onConfirm={handleDisableFolder}
                    className="text-sm text-clay-700 hover:text-clay-600 underline"
                  />
                ) : (
                  <button type="button" onClick={handleEnableFolder} className="text-sm text-clay-700 hover:text-clay-600 underline">
                    {t.settings.folderBackupEnable}
                  </button>
                )}
                <button type="button" onClick={handleRestoreFromFolder} className="text-sm text-clay-700 hover:text-clay-600 underline">
                  {t.settings.folderBackupRestore}
                </button>
              </div>
              {folderMessage === 'error' && <p className="text-xs text-clay-700">{t.aiAssist.failed}</p>}
            </div>
          ) : (
            <p className="text-xs text-ink-500 pt-2 border-t border-linen-200">{t.settings.folderBackupUnsupported}</p>
          )}

          <div>
            <ConfirmButton
              label={t.settings.clearAll}
              prompt={t.settings.clearConfirm}
              onConfirm={resetAllLocalData}
              className="text-sm text-clay-700 hover:text-clay-600 underline"
            />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-ink-500 uppercase tracking-wide mb-2">{t.settings.aboutHeading}</h2>
        <p className="text-sm text-ink-500 leading-relaxed">{t.settings.aboutBody}</p>
      </section>
    </div>
  );
}
