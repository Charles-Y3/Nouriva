import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useT } from '../hooks/useT';
import { reactToPost } from '../services/postsApi';
import type { Post, ReactionType } from '../types';

export default function ReactionBar({ post }: { post: Post }) {
  const { hasReacted, recordReactionGiven } = useApp();
  const t = useT();
  const [counts, setCounts] = useState({
    felt: post.reaction_felt_count,
    inspired: post.reaction_inspired_count,
    thanks: post.reaction_thanks_count,
  });
  const [pending, setPending] = useState<ReactionType | null>(null);

  const REACTIONS: { type: ReactionType; icon: string; label: string }[] = [
    { type: 'felt', icon: '♡', label: t.reactions.felt },
    { type: 'inspired', icon: '✨', label: t.reactions.inspired },
    { type: 'thanks', icon: '🙏', label: t.reactions.thanks },
  ];

  async function react(type: ReactionType) {
    if (hasReacted(post.id, type) || pending) return;
    setPending(type);
    setCounts(prev => ({ ...prev, [type]: prev[type] + 1 }));
    recordReactionGiven(post.id, type);
    try {
      await reactToPost(post.id, type);
    } catch {
      // Optimistic update stands even on failure — a lost reaction click
      // isn't worth surfacing an error for on something this lightweight.
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex items-center gap-4">
      {REACTIONS.map(r => {
        const given = hasReacted(post.id, r.type);
        return (
          <button
            key={r.type}
            type="button"
            onClick={() => react(r.type)}
            disabled={given}
            title={r.label}
            className={`flex items-center gap-1.5 text-sm transition-colors ${
              given ? 'text-clay-700' : 'text-ink-500 hover:text-clay-600'
            } disabled:cursor-default`}
          >
            <span className="text-base">{r.icon}</span>
            <span className="tabular-nums">{counts[r.type]}</span>
          </button>
        );
      })}
    </div>
  );
}
