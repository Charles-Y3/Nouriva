import type { Language, Post } from '../types';

// A reader sees every post in ONE language: their settings language. Each post
// keeps what its author typed (the original columns) and, once the server has
// translated it, a version in the other language (`translated`, see
// api/_translate.ts). This picks the right one and, for Chinese readers, turns
// Simplified into Traditional (or back) with a plain character conversion.
//
// A post whose translation isn't ready yet (queued, paused, failed) shows its
// original with `originalPending` set, which the card turns into a small tag.
export type ReaderLang = 'en' | 'zh';
export const readerLang = (language: Language): ReaderLang => (language === 'en' ? 'en' : 'zh');

export type Convert = (text: string) => string;
export type LocalizedPost = Post & { originalPending?: boolean };

const TEXT_FIELDS = ['dish_name', 'description', 'reflection', 'ingredients', 'recipe'] as const;

export function localizePost(post: Post, language: Language, convert?: Convert): LocalizedPost {
  const reader = readerLang(language);
  let out: LocalizedPost = post;
  if (post.source_lang && post.source_lang !== reader) {
    const t = post.translated;
    if (t && typeof t.dish_name === 'string') {
      out = {
        ...post,
        dish_name: t.dish_name,
        description: t.description ?? null,
        reflection: t.reflection ?? post.reflection,
        ingredients: t.ingredients ?? null,
        recipe: t.recipe ?? null,
      };
    } else {
      out = { ...post, originalPending: true };
    }
  }
  if (reader === 'zh' && convert) {
    const next: LocalizedPost = { ...out };
    for (const k of TEXT_FIELDS) {
      const v = next[k];
      if (typeof v === 'string' && v) (next as any)[k] = convert(v);
    }
    out = next;
  }
  return out;
}

// opencc-js is ~1 MB, so it is only fetched for Chinese readers, on first use.
const converters: Partial<Record<Language, Promise<Convert>>> = {};
export function loadConverter(language: Language): Promise<Convert> {
  if (language === 'zh-Hant') {
    return (converters[language] ??= import('opencc-js/cn2t').then(m => m.Converter({ from: 'cn', to: 't' })));
  }
  if (language === 'zh-Hans') {
    return (converters[language] ??= import('opencc-js/t2cn').then(m => m.Converter({ from: 't', to: 'cn' })));
  }
  return Promise.resolve(s => s);
}
