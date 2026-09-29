// Uploads a photo Blob to the server, which forwards it to Vercel Blob
// storage (needs a server-held write token — see api/_app.ts). Returns the
// public URL to store on the post row.
export async function uploadPhoto(blob: Blob): Promise<string> {
  const res = await fetch('/api/upload-photo', {
    method: 'POST',
    headers: { 'Content-Type': blob.type || 'image/jpeg' },
    body: blob,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || body.error || 'Photo upload failed');
  }
  const { url } = await res.json();
  return url as string;
}
