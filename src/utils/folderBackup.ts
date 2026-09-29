import { buildBackup, downloadBackup, isValidBackup, type NourivaBackup } from './backup';

// Auto-backs up drafts + preferences to a fixed-name file in a
// user-granted folder on disk, via the File System Access API
// (Chromium-only — Chrome/Edge on desktop, not Firefox/Safari/iOS).
// Ported from living-in-harmony's src/utils/folderBackup.ts, trimmed down:
// Nouriva has no backup-nudge/reminder cadence (the data at risk here is a
// handful of drafts, not years of journal records), so this just saves
// silently on every draft/preference change instead of nudging the user.

const BACKUP_FILENAME = 'nouriva-backup.json';
const DB_NAME = 'nouriva_fs';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'backupDir';
const ENABLED_KEY = 'nouriva_auto_save_folder_enabled';
const FOLDER_NAME_KEY = 'nouriva_auto_save_folder_name';

export function isFolderBackupSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export function isFolderBackupEnabled(): boolean {
  return localStorage.getItem(ENABLED_KEY) === 'true';
}

export function getFolderBackupName(): string | null {
  return localStorage.getItem(FOLDER_NAME_KEY);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function storeHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadHandle(): Promise<FileSystemDirectoryHandle | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
    req.onsuccess = () => resolve(req.result as FileSystemDirectoryHandle | undefined);
    req.onerror = () => reject(req.error);
  });
}

// Silent check only — never calls requestPermission(), which would pop a
// permission dialog on a background write. If permission was revoked, the
// write is simply skipped; only an explicit user action (enable/import,
// both below) re-requests permission.
async function getHandleIfAlreadyGranted(): Promise<FileSystemDirectoryHandle | null> {
  const handle = await loadHandle();
  if (!handle) return null;
  const perm = await (handle as any).queryPermission?.({ mode: 'readwrite' });
  return perm === 'granted' ? handle : null;
}

// Must be called from a user gesture (click handler) — showDirectoryPicker
// requires transient activation.
async function getVerifiedHandle(handle: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle | null> {
  const perm = await (handle as any).queryPermission?.({ mode: 'readwrite' });
  if (perm === 'granted') return handle;
  const requested = await (handle as any).requestPermission?.({ mode: 'readwrite' });
  return requested === 'granted' ? handle : null;
}

async function writeBackupToHandle(handle: FileSystemDirectoryHandle, backup: NourivaBackup): Promise<void> {
  const fileHandle = await (handle as any).getFileHandle(BACKUP_FILENAME, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(backup, null, 2));
  await writable.close();
}

/** Called after every draft/preference change. Silent no-op if folder
 * backup isn't enabled or permission has been revoked since. */
export async function autoSaveIfEnabled(): Promise<void> {
  if (!isFolderBackupEnabled()) return;
  const handle = await getHandleIfAlreadyGranted();
  if (!handle) return;
  try {
    await writeBackupToHandle(handle, buildBackup());
  } catch {
    // Best-effort — a failed background write shouldn't surface an error
    // for something this low-stakes (a few drafts).
  }
}

/** User-gesture-only: opens the folder picker, grants readwrite access,
 * writes an initial backup, and remembers the handle for future
 * auto-saves. Throws on user cancellation (AbortError) — caller should
 * treat that as "nothing happened," not a failure. */
export async function enableFolderBackup(): Promise<string> {
  const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
  await writeBackupToHandle(handle, buildBackup());
  await storeHandle(handle);
  localStorage.setItem(ENABLED_KEY, 'true');
  localStorage.setItem(FOLDER_NAME_KEY, handle.name);
  return handle.name;
}

export function disableFolderBackup(): void {
  localStorage.setItem(ENABLED_KEY, 'false');
  localStorage.removeItem(FOLDER_NAME_KEY);
}

/** One folder picker call both restores data from an existing backup file
 * AND (re-)grants the handle for future auto-saves — so after a storage
 * wipe, choosing the backup folder once does both jobs. Throws
 * Error('NO_BACKUP_FILE') if the folder has no backup file; the
 * handle/enabled-flag are only persisted once a real file is found. */
export async function importFromFolder(): Promise<NourivaBackup> {
  const handle: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
  let fileHandle;
  try {
    fileHandle = await (handle as any).getFileHandle(BACKUP_FILENAME);
  } catch {
    throw new Error('NO_BACKUP_FILE');
  }
  const file = await fileHandle.getFile();
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (!isValidBackup(parsed)) throw new Error('NO_BACKUP_FILE');

  await storeHandle(handle);
  localStorage.setItem(ENABLED_KEY, 'true');
  localStorage.setItem(FOLDER_NAME_KEY, handle.name);
  return parsed;
}

/** Shared decision point for every "export" entry point: folder mode
 * already on -> silent overwrite; folder API supported but not yet
 * enabled -> prompt to grant one (never silently fall back to a download
 * when the folder flow is available); cancelled picker -> do nothing;
 * anything else / unsupported -> plain download. */
export async function exportSmart(): Promise<{ mode: 'folder' | 'download' | 'cancelled'; folderName?: string }> {
  if (isFolderBackupEnabled()) {
    await autoSaveIfEnabled();
    return { mode: 'folder', folderName: getFolderBackupName() || undefined };
  }
  if (isFolderBackupSupported()) {
    try {
      const name = await enableFolderBackup();
      return { mode: 'folder', folderName: name };
    } catch (err: any) {
      if (err?.name === 'AbortError') return { mode: 'cancelled' };
      // Fall through to plain download on any other failure.
    }
  }
  downloadBackup();
  return { mode: 'download' };
}
