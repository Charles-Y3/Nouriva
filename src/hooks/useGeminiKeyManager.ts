import { useApp } from '../context/AppContext';
import { encryptApiKey, decryptApiKey, isEncryptedFormat } from '../services/keyEncryption';

/** Centralizes the passphrase-encrypted Gemini key flow so Settings and any
 * other AI entry point share identical save/unlock/clear behavior instead
 * of divergent copies of the crypto logic. */
export function useGeminiKeyManager() {
  const { preferences, updatePreferences } = useApp();

  const isLocked = isEncryptedFormat(preferences.geminiKeyEncrypted) && !preferences.customGeminiApiKey;
  const isUnlocked = Boolean(preferences.customGeminiApiKey?.trim());
  const hasSavedKey = isEncryptedFormat(preferences.geminiKeyEncrypted);

  /** Encrypts `rawKey` with `passphrase` and stores both the ciphertext
   * (persisted, would travel with a future data export) and the plaintext
   * (persisted separately on this device only, via AppContext — see
   * 'nouriva_gemini_api_key_local'). */
  async function saveKey(rawKey: string, passphrase: string): Promise<void> {
    const trimmedKey = rawKey.trim();
    if (!trimmedKey) {
      updatePreferences({ customGeminiApiKey: '', geminiKeyEncrypted: undefined });
      return;
    }
    const encrypted = await encryptApiKey(trimmedKey, passphrase);
    updatePreferences({ customGeminiApiKey: trimmedKey, geminiKeyEncrypted: encrypted });
  }

  /** Attempts to decrypt the saved key with `passphrase`. Returns false (no
   * throw) on a wrong passphrase or corrupt data. */
  async function unlockKey(passphrase: string): Promise<boolean> {
    if (!preferences.geminiKeyEncrypted) return false;
    try {
      const plain = await decryptApiKey(preferences.geminiKeyEncrypted, passphrase);
      updatePreferences({ customGeminiApiKey: plain });
      return true;
    } catch {
      return false;
    }
  }

  function clearKey(): void {
    updatePreferences({ customGeminiApiKey: '', geminiKeyEncrypted: undefined });
  }

  return { isLocked, isUnlocked, hasSavedKey, saveKey, unlockKey, clearKey };
}
