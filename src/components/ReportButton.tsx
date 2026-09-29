import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useT } from '../hooks/useT';
import { reportPost } from '../services/postsApi';

export default function ReportButton({ postId }: { postId: string }) {
  const { hasReported, recordReportGiven } = useApp();
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(hasReported(postId));

  if (done) {
    return <span className="text-xs text-ink-500">{t.reactions.reported}</span>;
  }

  if (confirming) {
    return (
      <span className="text-xs text-ink-500 flex items-center gap-2">
        {t.reactions.reportPrompt}
        <button
          type="button"
          className="underline"
          onClick={async () => {
            recordReportGiven(postId);
            setDone(true);
            try {
              await reportPost(postId);
            } catch {
              // Local state already reflects the report either way.
            }
          }}
        >
          {t.reactions.reportYes}
        </button>
        <button type="button" className="underline" onClick={() => setConfirming(false)}>
          {t.reactions.reportCancel}
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="text-xs text-ink-500 hover:text-clay-700 underline decoration-dotted"
    >
      {t.reactions.reportButton}
    </button>
  );
}
