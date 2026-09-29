import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useT } from '../hooks/useT';
import { fetchPostById } from '../services/postsApi';
import type { Post } from '../types';
import ConfirmButton from './ConfirmButton';
import EmptyState from './EmptyState';
import PostCard from './PostCard';

export default function MyNourivaView({
  onResumeDraft,
  onOpenPost,
}: {
  onResumeDraft: (draftId: string) => void;
  onOpenPost: (id: string) => void;
}) {
  const { drafts, deleteDraft, myPostIds } = useApp();
  const t = useT();
  const [posts, setPosts] = useState<Post[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(myPostIds.map(ref => fetchPostById(ref.id).catch(() => null))).then(results => {
      if (!cancelled) setPosts(results.filter((p): p is Post => p !== null));
    });
    return () => {
      cancelled = true;
    };
  }, [myPostIds]);

  return (
    <div className="pt-4 space-y-8">
      <h1 className="text-xl font-semibold text-ink-900">{t.myNouriva.heading}</h1>

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
        <h2 className="text-sm font-semibold text-ink-500 uppercase tracking-wide mb-2">{t.myNouriva.sharedHeading}</h2>
        {myPostIds.length === 0 ? (
          <EmptyState title={t.myNouriva.noneSharedTitle} body={t.myNouriva.noneSharedBody} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {posts.map(p => (
              <PostCard key={p.id} post={p} onOpen={onOpenPost} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
