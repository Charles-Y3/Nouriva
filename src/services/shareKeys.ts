// Authorship without accounts. Sharing generates a random secret key; only
// its SHA-256 goes to the server (stored on the post as owner_key_hash), the
// key itself stays on this device in "Shared by you" (and in its backup — the
// person never sees or handles it). The key is what later lets the author
// unshare, share again, edit or delete that one post.

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
