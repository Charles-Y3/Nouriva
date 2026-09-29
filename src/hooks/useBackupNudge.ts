import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { isFolderBackupEnabled } from '../utils/folderBackup';
import { shouldShowBackupNudge } from '../utils/backupReminder';

// Re-checked on every draft change (covers the common case: creating or
// editing a draft) and on a slow interval (catches the pure time-passing
// case — a draft that's simply been sitting unprotected while the tab
// stays open) — see utils/backupReminder.ts for the actual cadence.
export function useBackupNudge() {
  const { drafts } = useApp();
  const [visible, setVisible] = useState(false);

  function recheck() {
    setVisible(shouldShowBackupNudge(drafts, isFolderBackupEnabled()));
  }

  useEffect(() => {
    recheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts]);

  useEffect(() => {
    const interval = setInterval(recheck, 15 * 60 * 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts]);

  return { visible, hide: () => setVisible(false) };
}
