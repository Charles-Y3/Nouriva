import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Draft, Language, MyPostRef, ReactionType, UserPreferences } from '../types';
import { encryptForDevice, decryptForDevice } from '../services/deviceKeyStore';
import { autoSaveIfEnabled } from '../utils/folderBackup';

function detectDefaultLanguage(): Language {
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'en';
  if (nav.startsWith('zh')) {
    // zh-TW/zh-HK/zh-Hant* -> Traditional; everything else zh* -> Simplified.
    return /^zh-(TW|HK|Hant)/i.test(nav) ? 'zh-Hant' : 'zh-Hans';
  }
  return 'en';
}

const DEFAULT_PREFERENCES: UserPreferences = {
  completedIntro: false,
  language: detectDefaultLanguage(),
  fontSize: 'md',
};

// rem-based Tailwind classes scale off the root font-size, so this one
// line is enough to resize the entire app proportionally — same approach
// living-in-harmony uses for its font-size preference.
const FONT_SIZE_PX: Record<UserPreferences['fontSize'], string> = {
  sm: '14px',
  md: '16px',
  lg: '18px',
  xl: '20px',
};

interface AppContextType {
  preferences: UserPreferences;
  drafts: Draft[];
  myPostIds: MyPostRef[];
  reactionsGiven: Set<string>;
  reportsGiven: Set<string>;

  updatePreferences: (prefs: Partial<UserPreferences>) => void;
  saveDraft: (draft: Draft) => void;
  deleteDraft: (id: string) => void;
  markPublished: (draftId: string | undefined, publishedPostId: string) => void;
  recordReactionGiven: (postId: string, type: ReactionType) => void;
  hasReacted: (postId: string, type: ReactionType) => boolean;
  recordReportGiven: (postId: string) => void;
  hasReported: (postId: string) => boolean;
  resetAllLocalData: () => void;
  applyBackup: (backup: { drafts?: Draft[]; preferences?: Partial<UserPreferences> }) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preferences, setPreferencesState] = useState<UserPreferences>(() => {
    const saved = localStorage.getItem('nouriva_preferences');
    // The unlocked Gemini key's convenience copy lives in its own
    // localStorage slot (see the mount effect + save effect below) —
    // deliberately NOT part of this blob, so it's never swept into a future
    // local-data export and survives closing the app without needing the
    // passphrase again. See services/deviceKeyStore.ts for how it's wrapped.
    return saved ? { ...DEFAULT_PREFERENCES, ...JSON.parse(saved) } : DEFAULT_PREFERENCES;
  });

  const [drafts, setDrafts] = useState<Draft[]>(() => {
    const saved = localStorage.getItem('nouriva_drafts');
    return saved ? JSON.parse(saved) : [];
  });

  const [myPostIds, setMyPostIds] = useState<MyPostRef[]>(() => {
    const saved = localStorage.getItem('nouriva_my_posts');
    return saved ? JSON.parse(saved) : [];
  });

  const [reactionsGiven, setReactionsGiven] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('nouriva_reactions_given');
    return new Set(saved ? JSON.parse(saved) : []);
  });

  const [reportsGiven, setReportsGiven] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('nouriva_reports_given');
    return new Set(saved ? JSON.parse(saved) : []);
  });

  // One-time on mount: unwrap the device-encrypted convenience copy of the
  // Gemini key, if one was saved on a previous visit. Async (IndexedDB +
  // Web Crypto), so it can't happen in the useState initializer above.
  useEffect(() => {
    const wrapped = localStorage.getItem('nouriva_gemini_api_key_local');
    if (!wrapped) return;
    decryptForDevice(wrapped).then(plain => {
      if (plain) setPreferencesState(prev => ({ ...prev, customGeminiApiKey: plain }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // customGeminiApiKey (plaintext) is deliberately excluded from what's
  // written to nouriva_preferences — only geminiKeyEncrypted (ciphertext)
  // is persisted there. The plaintext instead gets wrapped with a
  // device-bound, non-extractable key and stored in its own
  // nouriva_gemini_api_key_local slot — never in the clear.
  useEffect(() => {
    const { customGeminiApiKey, ...persistable } = preferences;
    localStorage.setItem('nouriva_preferences', JSON.stringify(persistable));
    if (customGeminiApiKey !== undefined) {
      if (customGeminiApiKey) {
        encryptForDevice(customGeminiApiKey).then(wrapped => {
          localStorage.setItem('nouriva_gemini_api_key_local', wrapped);
        });
      } else {
        localStorage.removeItem('nouriva_gemini_api_key_local');
      }
    }
  }, [preferences]);

  useEffect(() => {
    document.documentElement.style.fontSize = FONT_SIZE_PX[preferences.fontSize];
  }, [preferences.fontSize]);

  useEffect(() => {
    localStorage.setItem('nouriva_drafts', JSON.stringify(drafts));
    // Silent no-op unless the user has enabled folder auto-backup in
    // Settings (see utils/folderBackup.ts) — never prompts here.
    autoSaveIfEnabled();
  }, [drafts]);

  useEffect(() => {
    localStorage.setItem('nouriva_my_posts', JSON.stringify(myPostIds));
  }, [myPostIds]);

  useEffect(() => {
    localStorage.setItem('nouriva_reactions_given', JSON.stringify([...reactionsGiven]));
  }, [reactionsGiven]);

  useEffect(() => {
    localStorage.setItem('nouriva_reports_given', JSON.stringify([...reportsGiven]));
  }, [reportsGiven]);

  const updatePreferences = (prefs: Partial<UserPreferences>) => {
    setPreferencesState(prev => ({ ...prev, ...prefs }));
  };

  const saveDraft = (draft: Draft) => {
    setDrafts(prev => {
      const idx = prev.findIndex(d => d.id === draft.id);
      const updated = { ...draft, updatedAt: Date.now() };
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updated;
        return next;
      }
      return [updated, ...prev];
    });
  };

  const deleteDraft = (id: string) => {
    setDrafts(prev => prev.filter(d => d.id !== id));
  };

  const markPublished = (draftId: string | undefined, publishedPostId: string) => {
    if (draftId) {
      setDrafts(prev => prev.filter(d => d.id !== draftId));
    }
    setMyPostIds(prev => [{ id: publishedPostId, publishedAt: Date.now() }, ...prev]);
  };

  const recordReactionGiven = (postId: string, type: ReactionType) => {
    setReactionsGiven(prev => new Set(prev).add(`${postId}:${type}`));
  };

  const hasReacted = (postId: string, type: ReactionType) => reactionsGiven.has(`${postId}:${type}`);

  const recordReportGiven = (postId: string) => {
    setReportsGiven(prev => new Set(prev).add(postId));
  };

  const hasReported = (postId: string) => reportsGiven.has(postId);

  // Used by Settings' "Import drafts" (JSON file) and "Restore from
  // folder" — merges rather than replaces preferences (so a restored
  // backup can't accidentally wipe, say, a language choice it predates),
  // but replaces the draft list wholesale (drafts have stable ids, so a
  // restore is meant to bring the device back to exactly that snapshot).
  const applyBackup = (backup: { drafts?: Draft[]; preferences?: Partial<UserPreferences> }) => {
    if (backup.drafts) setDrafts(backup.drafts);
    if (backup.preferences) setPreferencesState(prev => ({ ...prev, ...backup.preferences }));
  };

  const resetAllLocalData = () => {
    localStorage.clear();
    setPreferencesState(DEFAULT_PREFERENCES);
    setDrafts([]);
    setMyPostIds([]);
    setReactionsGiven(new Set());
    setReportsGiven(new Set());
  };

  return (
    <AppContext.Provider
      value={{
        preferences,
        drafts,
        myPostIds,
        reactionsGiven,
        reportsGiven,
        updatePreferences,
        saveDraft,
        deleteDraft,
        markPublished,
        recordReactionGiven,
        hasReacted,
        recordReportGiven,
        hasReported,
        resetAllLocalData,
        applyBackup,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
