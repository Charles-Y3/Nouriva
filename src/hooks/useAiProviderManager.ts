import { useApp } from '../context/AppContext';
import { encryptApiKey, decryptApiKey, isEncryptedFormat } from '../services/keyEncryption';
import type { AiProviderConfig } from '../types';

/** Centralizes the passphrase-encrypted AI provider config flow so Settings
 * and any other AI entry point share identical save/unlock/clear behavior
 * instead of divergent copies of the crypto logic. The config (base URL,
 * API key, model) is JSON-stringified before it hits the same generic
 * string-based encryption keyEncryption.ts already provides — that file
 * doesn't need to know or care what the plaintext represents. */
export function useAiProviderManager() {
  const { preferences, updatePreferences } = useApp();

  const isLocked = isEncryptedFormat(preferences.aiProviderEncrypted) && !preferences.customAiProvider;
  const isUnlocked = Boolean(preferences.customAiProvider?.apiKey?.trim());
  const hasSavedProvider = isEncryptedFormat(preferences.aiProviderEncrypted);

  /** Encrypts `config` with `passphrase` and stores both the ciphertext
   * (persisted, would travel with a future data export) and the plaintext
   * (persisted separately on this device only, via AppContext — see
   * 'nouriva_ai_provider_local'). */
  async function saveProvider(config: AiProviderConfig, passphrase: string): Promise<void> {
    if (!config.apiKey.trim()) {
      updatePreferences({ customAiProvider: null, aiProviderEncrypted: undefined });
      return;
    }
    const encrypted = await encryptApiKey(JSON.stringify(config), passphrase);
    updatePreferences({ customAiProvider: config, aiProviderEncrypted: encrypted });
  }

  /** Attempts to decrypt the saved config with `passphrase`. Returns false
   * (no throw) on a wrong passphrase or corrupt data. */
  async function unlockProvider(passphrase: string): Promise<boolean> {
    if (!preferences.aiProviderEncrypted) return false;
    try {
      const plain = await decryptApiKey(preferences.aiProviderEncrypted, passphrase);
      updatePreferences({ customAiProvider: JSON.parse(plain) });
      return true;
    } catch {
      return false;
    }
  }

  function clearProvider(): void {
    updatePreferences({ customAiProvider: null, aiProviderEncrypted: undefined });
  }

  return { isLocked, isUnlocked, hasSavedProvider, saveProvider, unlockProvider, clearProvider };
}
