// Passphrase-based encryption for the personal Gemini API key, using the
// browser's built-in Web Crypto API — no external crypto library needed.
//
// What this protects against: someone inspecting localStorage, a stolen
// device, or a leaked JSON export — none of those are useful without the
// passphrase, since only ciphertext is ever persisted.
//
// What this does NOT protect against: a live XSS attack running while the
// key is unlocked in the current tab session (it sits decrypted in memory
// then). There's no way to fully defend against that without a real
// backend-managed secret, which this local-first app deliberately doesn't
// have.

const ENCODED_PREFIX = 'v1:';
const PBKDF2_ITERATIONS = 150_000;

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

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export function isEncryptionSupported(): boolean {
  return typeof crypto !== 'undefined' && !!crypto.subtle;
}

export function isEncryptedFormat(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.startsWith(ENCODED_PREFIX);
}

/** Encrypts `plainKey` with `passphrase`. Result is a self-contained string
 * (salt + iv + ciphertext, all base64) safe to store in localStorage or
 * include in a JSON export — useless without the passphrase. */
export async function encryptApiKey(plainKey: string, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plainKey));
  return `${ENCODED_PREFIX}${toBase64(salt)}:${toBase64(iv)}:${toBase64(new Uint8Array(ciphertext))}`;
}

/** Decrypts a string produced by encryptApiKey. Throws if the passphrase is
 * wrong or the data is corrupt (AES-GCM's built-in authentication tag makes
 * a wrong passphrase fail loudly rather than silently returning garbage). */
export async function decryptApiKey(encoded: string, passphrase: string): Promise<string> {
  if (!isEncryptedFormat(encoded)) throw new Error('Not an encrypted key');
  const [, saltB64, ivB64, ciphertextB64] = encoded.split(':');
  const salt = fromBase64(saltB64);
  const iv = fromBase64(ivB64);
  const ciphertext = fromBase64(ciphertextB64);
  const key = await deriveKey(passphrase, salt);
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(plainBuf);
}
