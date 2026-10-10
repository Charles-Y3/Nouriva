import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { loadConverter, localizePost, type Convert, type LocalizedPost } from '../services/postLocale';
import type { Post } from '../types';

/** Returns a function that shows a post in the reader's settings language. Re-renders once the Chinese converter has loaded. */
export function useLocalizePost(): (post: Post) => LocalizedPost {
  const { preferences } = useApp();
  const language = preferences.language;
  const [loaded, setLoaded] = useState<{ language: string; convert: Convert } | null>(null);

  useEffect(() => {
    if (language === 'en') return;
    let cancelled = false;
    loadConverter(language).then(convert => { if (!cancelled) setLoaded({ language, convert }); }).catch(() => {});
    return () => { cancelled = true; };
  }, [language]);

  const convert = loaded && loaded.language === language ? loaded.convert : undefined;
  return useCallback((post: Post) => localizePost(post, language, convert), [language, convert]);
}
