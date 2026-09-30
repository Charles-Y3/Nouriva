import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useT } from '../hooks/useT';
import { STORIES, currentStoryWeek, storyText } from '../data/stories';
import type { Story } from '../data/stories';

function StoryBody({ story, onCook }: { story: Story; onCook: (tag: string) => void }) {
  const { preferences } = useApp();
  const t = useT();
  const text = storyText(story, preferences.language);

  return (
    <div>
      <p className="text-xs text-sage-600">
        {t.stories.weekLabel(story.week)} · ✨ {t.spiritTags[story.tag]}
      </p>
      <h2 className="mt-1 text-xl font-semibold text-ink-900 font-serif">{text.title}</h2>
      <div className="mt-3 space-y-3 font-serif text-[17px] leading-relaxed text-ink-700">
        {text.body.split('\n\n').map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-500 italic">
        {story.source === 'traditional' ? t.stories.sourceTraditional : t.stories.sourceOriginal}
      </p>

      <div className="mt-5 border-t border-linen-200 pt-4">
        <h3 className="text-sm font-semibold text-ink-900">{t.stories.questionsHeading}</h3>
        <ul className="mt-2 space-y-2">
          {text.questions.map((q, i) => (
            <li key={i} className="flex gap-2 text-[15px] text-ink-700">
              <span aria-hidden="true" className="text-clay-600">✦</span>
              <span>{q}</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => onCook(story.tag)}
          className="mt-4 bg-clay-600 hover:bg-clay-700 text-linen-50 rounded-full px-5 py-2 text-sm font-medium transition-colors"
        >
          {t.stories.cookCta}
        </button>
      </div>
    </div>
  );
}

// One fixed story per week — this week's, in full, plus the earlier weeks'
// stories to revisit. Later weeks stay unrevealed until their week arrives.
export default function StoriesView({ onCookForFeeling }: { onCookForFeeling: (tag: string) => void }) {
  const { preferences } = useApp();
  const t = useT();
  const week = useMemo(() => currentStoryWeek(), []);
  const current = STORIES[week - 1];
  // Only last week's story stays open to revisit — one, not the whole archive.
  const earlier = week > 1 ? [STORIES[week - 2]] : [];
  const [openWeek, setOpenWeek] = useState<number | null>(null);

  return (
    <div className="pt-4 space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">{t.stories.heading}</h1>
        <p className="mt-1 text-sm text-ink-500">{t.stories.subtitle}</p>
      </div>

      <article className="bg-linen-100 border border-linen-200 rounded-2xl p-5 sm:p-6">
        <p className="text-xs font-semibold text-clay-700 uppercase tracking-wide mb-2">{t.stories.thisWeek}</p>
        <StoryBody story={current} onCook={onCookForFeeling} />
      </article>

      <p className="text-xs text-ink-500 text-center">{t.stories.newEveryWeek}</p>

      {earlier.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-ink-500 uppercase tracking-wide mb-2">{t.stories.earlierHeading}</h2>
          <ul className="space-y-2">
            {earlier.map(s => {
              const open = openWeek === s.week;
              return (
                <li key={s.week} className="bg-linen-100 border border-linen-200 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpenWeek(open ? null : s.week)}
                    aria-expanded={open}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-ink-900 font-serif truncate">{storyText(s, preferences.language).title}</span>
                      <span className="text-xs text-ink-500">
                        {t.stories.weekLabel(s.week)} · {t.spiritTags[s.tag]}
                      </span>
                    </span>
                    <span className="text-ink-500 text-sm shrink-0" aria-hidden="true">{open ? '▴' : '▾'}</span>
                  </button>
                  {open && (
                    <div className="px-4 pb-5">
                      <StoryBody story={s} onCook={onCookForFeeling} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
