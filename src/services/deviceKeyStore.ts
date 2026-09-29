// Device-bound wrapping for the unlocked Gemini key's localStorage copy.
//
// Problem this solves: keeping the app usable across closes without asking
// for the passphrase again means SOME copy of the decrypted key has to sit
// in browser storage (see keyEncryption.ts's passphrase-encrypted copy,
// which is the one that travels with exports/backups — that one still
// requires the passphrase and is unaffected by this file). The alternative
// would be the raw plaintext string in localStorage, readable by anyone who
// opens DevTools -> Application -> Local Storage.
//
// This wraps that copy with a random AES-GCM key generated with
// extractable: false and stored in IndexedDB — the browser enforces that no
// JS on the page (including this app's own code) can ever read the raw key
// material out, only ask it to encrypt/decrypt. Casually inspecting
// localStorage or IndexedDB now shows ciphertext, not the key.
//
// What this does NOT protect against: a live XSS attack. A non-extractable
// key can still be *used* by any script running on the page — including a
// malicious one — to decrypt on demand, it just can't be copied out whole.
// That's a real but narrower attack surface than plaintext-in-localStorage,
// which any script (or anyone with the DevTools open) can read directly.

const DB_NAME = 'nouriva_device_key_store';
const STORE_NAME = 'keys';
const KEY_ID = 'gemini_wrap_key';
const ENCODED_PREFIX = 'dk1:';

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getStoredKey(): Promise<CryptoKey | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(KEY_ID);
    req.onsuccess = () => resolve(req.result as CryptoKey | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function putKey(key: CryptoKey): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(key, KEY_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Cached across calls within a page load so we don't hit IndexedDB on every
// encrypt/decrypt — the CryptoKey handle itself is cheap/safe to reuse.
let cachedKeyPromise: Promise<CryptoKey> | null = null;

async function getOrCreateDeviceKey(): Promise<CryptoKey> {
  if (!cachedKeyPromise) {
    cachedKeyPromise = (async () => {
      const existing = await getStoredKey();
      if (existing) return existing;
      const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      await putKey(key);
      return key;
    })();
  }
  return cachedKeyPromise;
}

export function isDeviceWrapSupported(): boolean {
  return typeof indexedDB !== 'undefined' && typeof crypto !== 'undefined' && !!crypto.subtle;
}

/** Wraps `plaintext` with this device's non-extractable key. Result is safe
 * to store in localStorage — meaningless without the IndexedDB-held key,
 * and that key itself can never be read out, only used in-page. */
export async function encryptForDevice(plaintext: string): Promise<string> {
  const key = await getOrCreateDeviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return `${ENCODED_PREFIX}${toBase64(iv)}:${toBase64(new Uint8Array(ciphertext))}`;
}

/** Reverses encryptForDevice. Returns null (never throws) on missing/corrupt
 * data or a device key that's since disappeared (e.g. browser storage was
 * cleared) — callers should treat that the same as "no key saved yet". */
export async function decryptForDevice(payload: string): Promise<string | null> {
  try {
    if (!payload.startsWith(ENCODED_PREFIX)) return null;
    const [ivB64, ctB64] = payload.slice(ENCODED_PREFIX.length).split(':');
    const key = await getOrCreateDeviceKey();
    const plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(ivB64) },
      key,
      fromBase64(ctB64)
    );
    return new TextDecoder().decode(plainBuf);
  } catch {
    return null;
  }
}
