import { useT } from '../hooks/useT';
import { dismissBackupNudge, markBackedUp, snoozeBackupNudgeLonger } from '../utils/backupReminder';
import { exportSmart } from '../utils/folderBackup';

export default function BackupNudge({ onHide }: { onHide: () => void }) {
  const t = useT();

  async function backUpNow() {
    const result = await exportSmart();
    if (result.mode !== 'cancelled') markBackedUp();
    if (result.mode !== 'cancelled') onHide();
    // A cancelled folder picker leaves the nudge up — the user backed out
    // of the picker, not out of wanting to be reminded.
  }

  return (
    <div className="fixed bottom-36 left-1/2 -translate-x-1/2 z-20 max-w-sm w-[calc(100%-2rem)] bg-linen-100 border border-linen-200 rounded-2xl p-4 shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-ink-700">{t.backupNudge.message}</p>
        <button
          type="button"
          onClick={() => {
            dismissBackupNudge();
            onHide();
          }}
          className="text-ink-500 hover:text-ink-900 shrink-0"
        >
          ✕
        </button>
      </div>
      <div className="mt-3 flex gap-3">
        <button
          type="button"
          onClick={backUpNow}
          className="bg-clay-600 hover:bg-clay-700 text-linen-50 rounded-full px-4 py-1.5 text-sm"
        >
          {t.backupNudge.backUpNow}
        </button>
        <button
          type="button"
          onClick={() => {
            snoozeBackupNudgeLonger();
            onHide();
          }}
          className="text-sm text-ink-500 underline"
        >
          {t.backupNudge.remindLater}
        </button>
      </div>
    </div>
  );
}
