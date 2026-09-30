import { useEffect, useState } from 'react';
import type { Draft, NavTab, Post } from './types';
import { useApp } from './context/AppContext';
import { useBackupNudge } from './hooks/useBackupNudge';
import Header from './components/Header';
import NavTabs from './components/NavTabs';
import BrowseView from './components/BrowseView';
import { CreateView } from './components/CreateView/CreateView';
import MyNourivaView from './components/MyNourivaView';
import StoriesView from './components/StoriesView';
import SettingsView from './components/SettingsView';
import PostDetail from './components/PostDetail';
import OnboardingModal from './components/OnboardingModal';
import UpdateToast from './components/UpdateToast';
import BackupNudge from './components/BackupNudge';

function matchPostId(pathname: string): string | null {
  const m = pathname.match(/^\/post\/([^/]+)\/?$/);
  return m ? m[1] : null;
}

export default function App() {
  const { preferences, drafts, saveDraft } = useApp();
  const backupNudge = useBackupNudge();
  const [tab, setTab] = useState<NavTab>('browse');
  const [directPostId, setDirectPostId] = useState<string | null>(() => matchPostId(window.location.pathname));
  const [resumeDraftId, setResumeDraftId] = useState<string | undefined>(undefined);
  // Set by a Story's "cook something to match" — Browse opens Inspire me on that feeling.
  const [inspireTag, setInspireTag] = useState<string | null>(null);

  useEffect(() => {
    const onPopState = () => setDirectPostId(matchPostId(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  function openPost(id: string) {
    window.history.pushState({}, '', `/post/${id}`);
    setDirectPostId(id);
  }

  // Shared by "resume a saved draft" (My Nouriva) and "cook this" (Inspire
  // me, which saves a new pre-filled draft first) — both just need Create
  // to open on a specific existing draft id.
  function openDraftInCreate(id: string) {
    setResumeDraftId(id);
    setTab('create');
  }

  // Editing an already-shared dish: load it into a draft that remembers the
  // post id + key, so sharing that draft updates the same post in place.
  function editSharedPost(post: Post, key: string) {
    const existing = drafts.find(d => d.sharedPostId === post.id);
    if (existing) {
      openDraftInCreate(existing.id);
      return;
    }
    const now = Date.now();
    const draft: Draft = {
      id: 'draft_' + now,
      dishName: post.dish_name,
      reflection: post.reflection,
      ingredients: post.ingredients || '',
      recipe: post.recipe || '',
      spiritTags: post.spirit_tags,
      category: post.category || undefined,
      nutrition: post.nutrition || undefined,
      photoPreviewDataUrl: post.photo_url || undefined,
      sharedPostId: post.id,
      sharedPostKey: key,
      createdAt: now,
      updatedAt: now,
    };
    saveDraft(draft);
    openDraftInCreate(draft.id);
  }

  if (directPostId) {
    return (
      <PostDetail
        postId={directPostId}
        onBack={() => {
          window.history.pushState({}, '', '/');
          setDirectPostId(null);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-linen-50 text-ink-900 flex flex-col">
      <Header onOpenSettings={() => setTab('settings')} settingsActive={tab === 'settings'} />
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 pb-24 pt-4">
        {tab === 'browse' && (
          <BrowseView
            onCreate={() => setTab('create')}
            onOpenPost={openPost}
            onInspireDraft={openDraftInCreate}
            inspireTag={inspireTag}
            onInspireTagHandled={() => setInspireTag(null)}
          />
        )}
        {tab === 'create' && (
          <CreateView
            resumeDraftId={resumeDraftId}
            onDone={() => {
              setResumeDraftId(undefined);
              setTab('my-nouriva');
            }}
          />
        )}
        {tab === 'stories' && (
          <StoriesView
            onCookForFeeling={tag => {
              setInspireTag(tag);
              setTab('browse');
            }}
          />
        )}
        {tab === 'my-nouriva' && (
          <MyNourivaView onResumeDraft={openDraftInCreate} onOpenPost={openPost} onEditShared={editSharedPost} />
        )}
        {tab === 'settings' && <SettingsView />}
      </main>
      <NavTabs current={tab} onChange={setTab} />
      <UpdateToast />
      {preferences.completedIntro && backupNudge.visible && <BackupNudge onHide={backupNudge.hide} />}
      {!preferences.completedIntro && <OnboardingModal />}
    </div>
  );
}
