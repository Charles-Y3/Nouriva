import type { Draft } from '../types';

// Nudges the user to protect their drafts (export/import JSON, or folder
// auto-backup — see backup.ts/folderBackup.ts) if they've had unprotected
// drafts sitting around for a while. Lower urgency than living-in-harmony's
// equivalent nudge: Nouriva's published posts already live in Supabase, so
// the only thing at risk here is a handful of local drafts — hence a
// longer delay before the first nudge, and a longer snooze, than a
// higher-stakes local-only journal app would want.
const LAST_BACKUP_KEY = 'nouriva_last_backup_at';
const SNOOZE_UNTIL_KEY = 'nouriva_backup_nudge_snoozed_until';
const NUDGE_DELAY_MS = 3 * 24 * 60 * 60 * 1000; // 3 days with an unprotected draft
const DISMISS_SNOOZE_MS = 1 * 24 * 60 * 60 * 1000; // "x" close — ask again tomorrow
const REMIND_LATER_SNOOZE_MS = 5 * 24 * 60 * 60 * 1000; // explicit "remind me later"

/** Call after any successful export/import/folder-backup action — marks
 * "everything currently drafted has been protected as of now." */
export function markBackedUp(): void {
  localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
}

export function dismissBackupNudge(): void {
  localStorage.setItem(SNOOZE_UNTIL_KEY, String(Date.now() + DISMISS_SNOOZE_MS));
}

export function snoozeBackupNudgeLonger(): void {
  localStorage.setItem(SNOOZE_UNTIL_KEY, String(Date.now() + REMIND_LATER_SNOOZE_MS));
}

/** Approximate, not per-draft-precise: uses the more recent of "last
 * backup" and "oldest current draft's creation time" as the point
 * unprotected time is measured from. Drafts edited after a backup but
 * before NUDGE_DELAY_MS elapses won't nudge again immediately — acceptable
 * for something this low-stakes; a full per-draft dirty-tracking system
 * would be overkill here. */
export function shouldShowBackupNudge(drafts: Draft[], folderBackupEnabled: boolean): boolean {
  if (folderBackupEnabled || drafts.length === 0) return false;
  const now = Date.now();
  const snoozedUntil = Number(localStorage.getItem(SNOOZE_UNTIL_KEY) || 0);
  if (now < snoozedUntil) return false;
  const lastBackupAt = Number(localStorage.getItem(LAST_BACKUP_KEY) || 0);
  const oldestDraftAt = Math.min(...drafts.map(d => d.createdAt));
  const protectedSince = Math.max(lastBackupAt, oldestDraftAt);
  return now - protectedSince > NUDGE_DELAY_MS;
}
