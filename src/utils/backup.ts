import type { Draft, MyPostRef, UserPreferences } from '../types';

export interface NourivaBackup {
  app: 'nouriva';
  schema: 1 | 2;
  exportedAt: string;
  drafts: Draft[];
  preferences: Omit<UserPreferences, 'customAiProvider'>;
  // Added in schema 2 — a backup built before this only restored drafts and
  // preferences, so a storage wipe silently lost "Shared by you" (the
  // local record of which posts this device published) and the per-device
  // reaction/report de-dupe sets. Optional so old backup files still import
  // cleanly, just without these fields.
  myPostIds?: MyPostRef[];
  reactionsGiven?: string[];
  reportsGiven?: string[];
}

// Builds one canonical backup shape read directly from localStorage, used
// by both the manual Export button and folder auto-save (folderBackup.ts)
// so the two paths can't diverge. Deliberately excludes
// nouriva_ai_provider_local (device-wrapped ciphertext) — it's not
// portable across devices, same reasoning as living-in-harmony's backup.ts.
export function buildBackup(): NourivaBackup {
  const drafts: Draft[] = JSON.parse(localStorage.getItem('nouriva_drafts') || '[]');
  const preferences = JSON.parse(localStorage.getItem('nouriva_preferences') || '{}');
  const myPostIds: MyPostRef[] = JSON.parse(localStorage.getItem('nouriva_my_posts') || '[]');
  const reactionsGiven: string[] = JSON.parse(localStorage.getItem('nouriva_reactions_given') || '[]');
  const reportsGiven: string[] = JSON.parse(localStorage.getItem('nouriva_reports_given') || '[]');
  return {
    app: 'nouriva',
    schema: 2,
    exportedAt: new Date().toISOString(),
    drafts,
    preferences,
    myPostIds,
    reactionsGiven,
    reportsGiven,
  };
}

export function isValidBackup(data: unknown): data is NourivaBackup {
  if (!data || typeof data !== 'object') return false;
  const d = data as any;
  return d.app === 'nouriva' && (Array.isArray(d.drafts) || d.preferences);
}

// Plain <a download> can't overwrite a file in place — repeat downloads
// get "(1)", "(2)" suffixed by the browser — so this uses a timestamped
// filename. The folder auto-save path (folderBackup.ts) uses a fixed name
// instead, since it genuinely overwrites in place via the File System
// Access API.
export function downloadBackup(): void {
  const backup = buildBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nouriva-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function readBackupFile(file: File): Promise<NourivaBackup> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (!isValidBackup(parsed)) return reject(new Error('Not a Nouriva backup file'));
        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
