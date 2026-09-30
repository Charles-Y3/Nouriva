// Authorship without accounts. Sharing generates a random secret key; only
// its SHA-256 goes to the server (stored on the post as owner_key_hash), the
// key itself stays on this device in "Shared by you" (and its backup). The
// key is what later lets the author hide, show again or edit that one post.
//
// The "recovery code" is `<postId>.<key>` — a single string the author can
// save and paste back in on a new device or after clearing storage.

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  bytes.forEach(b => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function generateShareKey(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashShareKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function makeRecoveryCode(postId: string, key: string): string {
  return `${postId}.${key}`;
}

export function parseRecoveryCode(code: string): { id: string; key: string } | null {
  const m = code.trim().match(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{16,200})$/i);
  return m ? { id: m[1], key: m[2] } : null;
}

// Anonymous per-browser id, sent with each new share so the database can
// rate-limit spam (see posts_guard in db/schema.sql). Not an identity.
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem('nouriva_device_id');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('nouriva_device_id', id);
    }
    return id;
  } catch {
    return 'unknown';
  }
}
