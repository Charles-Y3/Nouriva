import { useState } from 'react';
import { useT } from '../hooks/useT';

// Shared "click -> are you sure? -> confirm/cancel" pattern for delete-ish
// actions (draft delete, remove AI key, stop folder auto-backup, clear all
// local data) — every one of these always asks first now, no bare
// one-click delete anywhere in the app.
export default function ConfirmButton({
  label,
  prompt,
  onConfirm,
  className = 'text-xs text-ink-500 hover:text-clay-700',
}: {
  label: string;
  prompt: string;
  onConfirm: () => void;
  className?: string;
}) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-2 text-xs text-ink-700">
        {prompt}
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            onConfirm();
          }}
          className="underline text-clay-700"
        >
          {t.common.confirmYes}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="underline text-ink-500">
          {t.common.cancel}
        </button>
      </span>
    );
  }

  return (
    <button type="button" onClick={() => setConfirming(true)} className={className}>
      {label}
    </button>
  );
}
