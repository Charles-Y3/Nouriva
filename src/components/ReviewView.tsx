import { useCallback, useEffect, useState } from 'react';

// Admin review queue at /review (not linked from anywhere in the app). Lists
// every dish waiting for a decision — flagged by the AI screening, not
// screened, or an edit that was flagged — with Approve / Deny buttons. It is
// gated by the ADMIN_SECRET the server checks on every call; the secret is
// kept in this tab's sessionStorage only. Post content is rendered as plain
// text (React escapes it), and a photo is only loaded from Nouriva's own
// storage so a hostile URL can't be fetched just by opening this page.

interface PendingPost {
  id: string;
  dish_name: string;
  description: string | null;
  photo_url: string | null;
  ingredients: string | null;
  recipe: string | null;
  reflection: string;
  moderation_note: string | null;
  created_at: string;
}

interface DecidedPost {
  id: string;
  dish_name: string;
  status: 'visible' | 'hidden';
  moderated_at: string;
}

const OWN_PHOTO = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i;
const SECRET_KEY = 'nouriva_admin_secret';

function loadSecret(): string {
  try {
    return sessionStorage.getItem(SECRET_KEY) || '';
  } catch {
    return '';
  }
}

export default function ReviewView() {
  const [secret, setSecret] = useState(loadSecret);
  const [input, setInput] = useState('');
  const [posts, setPosts] = useState<PendingPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [recent, setRecent] = useState<DecidedPost[]>([]);

  const load = useCallback(async (s: string) => {
    setError(null);
    try {
      const res = await fetch('/api/admin/pending-posts', { headers: { 'x-admin-secret': s } });
      if (res.status === 403) {
        setError('Wrong admin secret.');
        setSecret('');
        try { sessionStorage.removeItem(SECRET_KEY); } catch { /* ignore */ }
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      setPosts((await res.json()).posts as PendingPost[]);
      const hist = await fetch('/api/admin/recent-decisions', { headers: { 'x-admin-secret': s } });
      if (hist.ok) setRecent((await hist.json()).posts as DecidedPost[]);
    } catch {
      setError('Could not load the queue.');
    }
  }, []);

  useEffect(() => {
    if (secret) load(secret);
  }, [secret, load]);

  // The tab title carries the count, so a pinned tab shows what is waiting.
  useEffect(() => {
    document.title = posts && posts.length > 0 ? `Review (${posts.length}) – Nouriva` : 'Review – Nouriva';
    return () => { document.title = 'Nouriva'; };
  }, [posts]);

  function signIn() {
    const s = input.trim();
    if (!s) return;
    try { sessionStorage.setItem(SECRET_KEY, s); } catch { /* ignore */ }
    setSecret(s);
    setInput('');
  }

  async function decide(post: PendingPost, action: 'approve' | 'hide') {
    setBusy(post.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/posts/${post.id}/${action}`, { method: 'POST', headers: { 'x-admin-secret': secret } });
      if (!res.ok) throw new Error(String(res.status));
      setPosts(prev => (prev ? prev.filter(p => p.id !== post.id) : prev));
      load(secret);
    } catch {
      setError('That did not work — try again.');
    } finally {
      setBusy(null);
    }
  }

  async function undo(post: DecidedPost) {
    setBusy(post.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/posts/${post.id}/requeue`, { method: 'POST', headers: { 'x-admin-secret': secret } });
      if (!res.ok) throw new Error(String(res.status));
      await load(secret);
    } catch {
      setError('That did not work — try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-linen-50 text-ink-900">
      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">Review queue</h1>
          <a href="/" className="text-sm text-clay-700 underline">Back to Nouriva</a>
        </div>

        {!secret ? (
          <div className="space-y-2">
            <p className="text-sm text-ink-500">Enter the admin secret to see dishes waiting for review.</p>
            <div className="flex gap-2">
              <input
                type="password"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && signIn()}
                placeholder="Admin secret"
                className="flex-1 rounded-full border border-linen-200 bg-linen-100 px-4 py-2 text-sm"
              />
              <button type="button" onClick={signIn} className="bg-clay-600 text-linen-50 rounded-full px-5 py-2 text-sm">Open</button>
            </div>
          </div>
        ) : posts === null ? (
          !error && <p className="text-sm text-ink-500">Loading…</p>
        ) : posts.length === 0 ? (
          <p className="text-sm text-ink-500">Nothing is waiting. 🎉</p>
        ) : (
          <ul className="space-y-4">
            {posts.map(p => (
              <li key={p.id} className="bg-linen-100 border border-linen-200 rounded-2xl overflow-hidden">
                {p.photo_url && (
                  OWN_PHOTO.test(p.photo_url)
                    ? <img src={p.photo_url} alt="" className="w-full max-h-80 object-cover" />
                    : <p className="px-4 pt-3 text-xs text-clay-700 break-all">Photo from another site (not loaded): {p.photo_url}</p>
                )}
                <div className="p-4 space-y-2">
                  <h2 className="font-semibold">{p.dish_name}</h2>
                  <p className="text-xs text-clay-700">{p.moderation_note || 'Waiting (no note)'}</p>
                  {p.description && <p className="text-sm text-ink-500">{p.description}</p>}
                  <p className="text-[15px] italic text-ink-700 whitespace-pre-wrap">"{p.reflection}"</p>
                  {p.ingredients && <p className="text-sm text-ink-700 whitespace-pre-wrap"><b>Ingredients:</b> {p.ingredients}</p>}
                  {p.recipe && <p className="text-sm text-ink-700 whitespace-pre-wrap"><b>Method:</b> {p.recipe}</p>}
                  <p className="text-xs text-ink-500">{new Date(p.created_at).toLocaleString()}</p>
                  <div className="flex gap-3 pt-2">
                    <button type="button" disabled={busy === p.id} onClick={() => decide(p, 'approve')} className="bg-sage-500 text-linen-50 rounded-full px-5 py-2 text-sm disabled:opacity-50">Approve</button>
                    <button type="button" disabled={busy === p.id} onClick={() => decide(p, 'hide')} className="border border-clay-600 text-clay-700 rounded-full px-5 py-2 text-sm disabled:opacity-50">Deny</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {secret && recent.length > 0 && (
          <section className="mt-10">
            <h2 className="text-sm font-semibold text-ink-500 uppercase tracking-wide mb-2">Recent decisions</h2>
            <ul className="space-y-2">
              {recent.map(r => (
                <li key={r.id} className="flex items-center justify-between gap-3 bg-linen-100 border border-linen-200 rounded-xl px-4 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.dish_name}</span>
                    <span className="text-xs text-ink-500">
                      {r.status === 'visible' ? 'Approved' : 'Denied'} · {new Date(r.moderated_at).toLocaleString()}
                    </span>
                  </span>
                  <button type="button" disabled={busy === r.id} onClick={() => undo(r)} className="shrink-0 text-clay-700 underline disabled:opacity-50">
                    Undo
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {error && <p className="mt-4 text-sm text-clay-700">{error}</p>}
      </main>
    </div>
  );
}
