import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useT } from '../hooks/useT';
import { fetchPostById } from '../services/postsApi';
import { fetchMyPosts, setPostHidden } from '../services/ownerApi';
import { makeRecoveryCode, parseRecoveryCode } from '../services/shareKeys';
import { ShareError } from '../services/postsApi';
import { CATEGORIES } from '../types';
import type { MyPostRef, Post } from '../types';
import ConfirmButton from './ConfirmButton';
import EmptyState from './EmptyState';
import PostCard from './PostCard';
import BookletModal from './BookletModal';

type ShareState = 'live' | 'hidden' | 'removed' | 'pending';

function stateOf(post: Post): ShareState {
  if (post.status === 'hidden') return 'removed';
  if (post.status === 'pending') return 'pending';
  return post.author_hidden ? 'hidden' : 'live';
}

export default function MyNourivaView({
  onResumeDraft,
  onOpenPost,
  onEditShared,
}: {
  onResumeDraft: (draftId: string) => void;
  onOpenPost: (id: string) => void;
  onEditShared: (post: Post, key: string) => void;
}) {
  const { drafts, deleteDraft, myPostIds, addMyPostRef, reactionsGiven } = useApp();
  const t = useT();
  const [posts, setPosts] = useState<Post[]>([]);
  const [controlsAvailable, setControlsAvailable] = useState(true);
  const [showBooklet, setShowBooklet] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [itemError, setItemError] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [restoreCode, setRestoreCode] = useState('');
  const [restoreError, setRestoreError] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  // The author's own view: keyed posts come from the key-checked owner route
  // (which also returns posts they've hidden); posts shared before keys
  // existed — or everything, if the server can't do owner lookups — fall back
  // to the public read, which only ever returns visible posts.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let owned: Post[] = [];
      let ownerOk = true;
      try {
        owned = await fetchMyPosts(myPostIds);
      } catch {
        ownerOk = false;
      }
      const ownedIds = new Set(owned.map(p => p.id));
      const rest = myPostIds.filter(r => !ownedIds.has(r.id));
      const publicPosts = await Promise.all(rest.map(r => fetchPostById(r.id).catch(() => null)));
      if (cancelled) return;
      const byId = new Map<string, Post>();
      owned.forEach(p => byId.set(p.id, p));
      publicPosts.forEach(p => p && byId.set(p.id, p));
      const ordered = myPostIds.map(r => byId.get(r.id)).filter((p): p is Post => Boolean(p));
      setPosts(ordered);
      setControlsAvailable(ownerOk);
      setExpanded(prev => (prev.size === 0 && ordered.length <= 3 ? new Set(ordered.map(p => p.id)) : prev));
    })();
    return () => {
      cancelled = true;
    };
  }, [myPostIds, reloadTick]);

  // Posts the person reacted to in Browse (felt this / inspired / thanks),
  // newest reaction first. Their own posts are left out — those already have
  // the "Shared by you" row.
  const likedIds = useMemo(() => {
    const ids: string[] = [];
    [...reactionsGiven].reverse().forEach(entry => {
      const id = entry.split(':')[0];
      if (!ids.includes(id) && !myPostIds.some(r => r.id === id)) ids.push(id);
    });
    return ids;
  }, [reactionsGiven, myPostIds]);
  const [likedPosts, setLikedPosts] = useState<Post[]>([]);
  const [likedOpen, setLikedOpen] = useState<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    Promise.all(likedIds.map(id => fetchPostById(id).catch(() => null))).then(found => {
      if (!cancelled) setLikedPosts(found.filter((p): p is Post => p !== null && p.status !== 'hidden' && !p.author_hidden));
    });
    return () => {
      cancelled = true;
    };
  }, [likedIds]);

  const refById = useMemo(() => new Map<string, MyPostRef>(myPostIds.map(r => [r.id, r])), [myPostIds]);
  const visiblePosts = posts.filter(p => !categoryFilter || p.category === categoryFilter);

  function toggleExpanded(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allExpanded = visiblePosts.length > 0 && visiblePosts.every(p => expanded.has(p.id));
  function toggleAll() {
    setExpanded(allExpanded ? new Set() : new Set(visiblePosts.map(p => p.id)));
  }

  async function setHidden(post: Post, key: string, hidden: boolean) {
    setBusyId(post.id);
    setItemError(prev => ({ ...prev, [post.id]: '' }));
    try {
      await setPostHidden(post.id, key, hidden);
      setReloadTick(n => n + 1);
    } catch (err) {
      const code = err instanceof ShareError ? err.code : undefined;
      const msg =
        code === 'toggle_limit' ? t.myNouriva.toggleLimit
        : code === 'removed' ? t.myNouriva.stateRemoved
        : code === 'unavailable' ? t.myNouriva.controlsUnavailable
        : t.myNouriva.actionFailed;
      setItemError(prev => ({ ...prev, [post.id]: msg }));
    } finally {
      setBusyId(null);
    }
  }

  async function copyCode(post: Post, key: string) {
    try {
      await navigator.clipboard.writeText(makeRecoveryCode(post.id, key));
      setCopiedId(post.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Clipboard unavailable — the code is shown on screen to copy by hand.
    }
  }

  async function restore() {
    setRestoreError(false);
    const parsed = parseRecoveryCode(restoreCode);
    if (!parsed) return setRestoreError(true);
    try {
      const found = await fetchMyPosts([{ id: parsed.id, key: parsed.key, publishedAt: Date.now() }]);
      if (found.length === 0) return setRestoreError(true);
      addMyPostRef({ id: parsed.id, key: parsed.key, publishedAt: Date.parse(found[0].created_at) || Date.now() });
      setRestoreCode('');
    } catch {
      setRestoreError(true);
    }
  }

  const badgeClass: Record<ShareState, string> = {
    live: 'bg-sage-500/15 text-sage-600',
    hidden: 'bg-linen-200 text-ink-700',
    removed: 'bg-clay-500/15 text-clay-700',
    pending: 'bg-linen-200 text-ink-700',
  };
  const stateLabel: Record<ShareState, string> = {
    live: t.myNouriva.stateLive,
    hidden: t.myNouriva.stateHidden,
    removed: t.myNouriva.stateRemoved,
    pending: t.myNouriva.statePending,
  };

  return (
    <div className="pt-4 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink-900">{t.myNouriva.heading}</h1>
        <button
          type="button"
          onClick={() => setShowBooklet(true)}
          className="text-sm text-clay-700 hover:text-clay-600 underline"
        >
          {t.booklet.openButton}
        </button>
      </div>

      {showBooklet && <BookletModal onClose={() => setShowBooklet(false)} />}

      <section>
        <h2 className="text-sm font-semibold text-ink-500 uppercase tracking-wide mb-2">{t.myNouriva.draftsHeading}</h2>
        {drafts.length === 0 ? (
          <p className="text-sm text-ink-500">{t.myNouriva.noDrafts}</p>
        ) : (
          <ul className="space-y-2">
            {drafts.map(d => (
              <li
                key={d.id}
                className="bg-linen-100 border border-linen-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3"
              >
                <button type="button" onClick={() => onResumeDraft(d.id)} className="text-left flex-1 min-w-0">
                  <p className="font-medium text-ink-900 truncate">{d.dishName || '—'}</p>
                  {d.sharedPostId && <p className="text-xs text-sage-600">{t.myNouriva.editingShared}</p>}
                  {d.reflection && <p className="text-sm text-ink-500 truncate">{d.reflection}</p>}
                </button>
                <div className="shrink-0">
                  <ConfirmButton
                    label={t.common.delete}
                    prompt={t.myNouriva.deleteDraftConfirm}
                    onConfirm={() => deleteDraft(d.id)}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between gap-3 mb-2">
          <h2 className="text-sm font-semibold text-ink-500 uppercase tracking-wide">{t.myNouriva.sharedHeading}</h2>
          {posts.length > 0 && (
            <button type="button" onClick={toggleAll} className="text-xs text-clay-700 hover:text-clay-600 underline">
              {allExpanded ? t.myNouriva.collapseAll : t.myNouriva.expandAll}
            </button>
          )}
        </div>

        {myPostIds.length === 0 ? (
          <EmptyState title={t.myNouriva.noneSharedTitle} body={t.myNouriva.noneSharedBody} />
        ) : (
          <>
            {posts.length > 1 && (
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                aria-label={t.browse.categoryLabel}
                className="mb-3 w-full sm:w-auto rounded-full border border-linen-200 bg-linen-100 px-3 py-2 text-sm text-ink-700"
              >
                <option value="">{t.myNouriva.allCategories}</option>
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{t.categories[c]}</option>
                ))}
              </select>
            )}

            {!controlsAvailable && <p className="mb-3 text-xs text-ink-500">{t.myNouriva.controlsUnavailable}</p>}

            {visiblePosts.length === 0 && posts.length > 0 && (
              <p className="text-sm text-ink-500">{t.myNouriva.noneInCategory}</p>
            )}

            <ul className="space-y-2">
              {visiblePosts.map(p => {
                const ref = refById.get(p.id);
                const key = ref?.key;
                const state = stateOf(p);
                const open = expanded.has(p.id);
                return (
                  <li key={p.id} className={`border border-linen-200 rounded-xl overflow-hidden ${state === 'live' ? 'bg-linen-100' : 'bg-linen-100/60'}`}>
                    <button
                      type="button"
                      onClick={() => toggleExpanded(p.id)}
                      aria-expanded={open}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
                    >
                      <span className="min-w-0">
                        <span className={`block font-medium truncate ${state === 'live' ? 'text-ink-900' : 'text-ink-500'}`}>{p.dish_name}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-2">
                          {p.category && <span className="text-xs text-ink-500">{t.categories[p.category] || p.category}</span>}
                          <span className={`text-[11px] rounded-full px-2 py-0.5 ${badgeClass[state]}`}>{stateLabel[state]}</span>
                        </span>
                      </span>
                      <span className="text-ink-500 text-sm shrink-0" aria-hidden="true">{open ? '▴' : '▾'}</span>
                    </button>

                    {open && (
                      <div className="px-4 pb-4 space-y-3">
                        {state === 'live' && <PostCard post={p} onOpen={onOpenPost} />}

                        {state !== 'removed' && key && controlsAvailable && (
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                            <button
                              type="button"
                              onClick={() => onEditShared(p, key)}
                              className="text-clay-700 hover:text-clay-600 underline"
                            >
                              {t.myNouriva.editButton}
                            </button>
                            {state === 'live' ? (
                              <ConfirmButton
                                label={t.myNouriva.hideButton}
                                prompt={t.myNouriva.hideConfirm}
                                onConfirm={() => setHidden(p, key, true)}
                                disabled={busyId === p.id}
                                className="text-sm text-ink-500 hover:text-clay-700 underline"
                              />
                            ) : (
                              <button
                                type="button"
                                disabled={busyId === p.id}
                                onClick={() => setHidden(p, key, false)}
                                className="text-clay-700 hover:text-clay-600 underline disabled:opacity-50"
                              >
                                {t.myNouriva.showAgain}
                              </button>
                            )}
                          </div>
                        )}

                        {itemError[p.id] && <p className="text-sm text-clay-700">{itemError[p.id]}</p>}

                        {!key && state !== 'removed' && <p className="text-xs text-ink-500">{t.myNouriva.noKeyNote}</p>}

                        {key && (
                          <div className="text-xs text-ink-500">
                            <p className="font-medium text-ink-700">{t.myNouriva.recoveryHeading}</p>
                            <p className="mt-0.5">{t.myNouriva.recoveryHint}</p>
                            <div className="mt-1.5 flex items-center gap-2">
                              <code className="flex-1 min-w-0 truncate rounded bg-linen-50 border border-linen-200 px-2 py-1 font-mono">
                                {makeRecoveryCode(p.id, key)}
                              </code>
                              <button
                                type="button"
                                onClick={() => copyCode(p, key)}
                                className="shrink-0 text-clay-700 hover:text-clay-600 underline"
                              >
                                {copiedId === p.id ? t.myNouriva.codeCopied : t.myNouriva.copyCode}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <div className="mt-5 text-sm">
          <p className="text-ink-500 mb-1.5">{t.myNouriva.restoreHeading}</p>
          <div className="flex gap-2">
            <input
              value={restoreCode}
              onChange={e => { setRestoreCode(e.target.value); setRestoreError(false); }}
              placeholder={t.myNouriva.restorePlaceholder}
              className="flex-1 min-w-0 rounded-full border border-linen-200 bg-linen-100 px-4 py-2 text-sm font-mono"
            />
            <button
              type="button"
              disabled={!restoreCode.trim()}
              onClick={restore}
              className="shrink-0 bg-linen-100 border border-linen-200 hover:border-sage-400 disabled:opacity-50 text-ink-700 rounded-full px-4 py-2 text-sm"
            >
              {t.myNouriva.restoreButton}
            </button>
          </div>
          {restoreError && <p className="mt-1.5 text-xs text-clay-700">{t.myNouriva.restoreFailed}</p>}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-ink-500 uppercase tracking-wide mb-2">{t.myNouriva.likedHeading}</h2>
        {likedIds.length === 0 ? (
          <p className="text-sm text-ink-500">{t.myNouriva.noLiked}</p>
        ) : (
          <ul className="space-y-2">
            {likedPosts.map(p => {
              const open = likedOpen.has(p.id);
              return (
                <li key={p.id} className="border border-linen-200 rounded-xl overflow-hidden bg-linen-100">
                  <button
                    type="button"
                    onClick={() => setLikedOpen(prev => {
                      const next = new Set(prev);
                      if (next.has(p.id)) next.delete(p.id);
                      else next.add(p.id);
                      return next;
                    })}
                    aria-expanded={open}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-ink-900 truncate">{p.dish_name}</span>
                      {p.category && <span className="text-xs text-ink-500">{t.categories[p.category] || p.category}</span>}
                    </span>
                    <span className="text-ink-500 text-sm shrink-0" aria-hidden="true">{open ? '▴' : '▾'}</span>
                  </button>
                  {open && (
                    <div className="px-4 pb-4">
                      <PostCard post={p} onOpen={onOpenPost} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
