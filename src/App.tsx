import { useEffect, useState } from 'react';
import type { NavTab } from './types';
import { useApp } from './context/AppContext';
import { useBackupNudge } from './hooks/useBackupNudge';
import Header from './components/Header';
import NavTabs from './components/NavTabs';
import BrowseView from './components/BrowseView';
import { CreateView } from './components/CreateView/CreateView';
import MyNourivaView from './components/MyNourivaView';
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
  const { preferences } = useApp();
  const backupNudge = useBackupNudge();
  const [tab, setTab] = useState<NavTab>('browse');
  const [directPostId, setDirectPostId] = useState<string | null>(() => matchPostId(window.location.pathname));
  const [resumeDraftId, setResumeDraftId] = useState<string | undefined>(undefined);

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
      <Header />
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 pb-24 pt-4">
        {tab === 'browse' && (
          <BrowseView onCreate={() => setTab('create')} onOpenPost={openPost} onInspireDraft={openDraftInCreate} />
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
        {tab === 'my-nouriva' && (
          <MyNourivaView onResumeDraft={openDraftInCreate} onOpenPost={openPost} />
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
