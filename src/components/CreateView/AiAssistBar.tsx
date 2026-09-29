import { useState } from 'react';
import ConsentNotice from '../ConsentNotice';
import { useT } from '../../hooks/useT';
import { isAiConsentShown, markAiConsentShown } from '../../services/aiConsent';
import { AiAssistError, helpExpressExperience, improveWriting, suggestSpiritTags, suggestTitle } from '../../services/aiService';
import { SPIRIT_TAGS } from '../../types';

type Action = 'improve_writing' | 'help_express' | 'suggest_title' | 'suggest_tags';

export default function AiAssistBar({
  dishName,
  text,
  onImproved,
  onExpressed,
  onTitles,
  onTags,
}: {
  dishName?: string;
  text: string;
  onImproved?: (result: string) => void;
  onExpressed?: (result: string) => void;
  onTitles?: (titles: string[]) => void;
  onTags?: (tags: string[]) => void;
}) {
  const t = useT();
  const [showConsent, setShowConsent] = useState(!isAiConsentShown());
  const [pending, setPending] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  function dismissConsent() {
    markAiConsentShown();
    setShowConsent(false);
  }

  async function run(action: Action, fn: () => Promise<void>) {
    if (!text.trim() && action !== 'suggest_title') return;
    dismissConsent();
    setPending(action);
    setError(null);
    try {
      await fn();
    } catch (err) {
      if (err instanceof AiAssistError) {
        setError(err.reason === 'no_api_key' ? t.aiAssist.noKey : err.reason === 'rate_limited' ? t.aiAssist.rateLimited : err.message);
      } else {
        setError(t.aiAssist.failed);
      }
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      {showConsent && <ConsentNotice onDismiss={dismissConsent} />}
      <div className="flex flex-wrap gap-2">
        {onImproved && (
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => run('improve_writing', async () => onImproved(await improveWriting(text)))}
            className="text-xs bg-linen-100 border border-linen-200 rounded-full px-3 py-1.5 text-ink-700 hover:border-sage-400 disabled:opacity-50"
          >
            {pending === 'improve_writing' ? t.aiAssist.improving : t.aiAssist.improve}
          </button>
        )}
        {onExpressed && (
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => run('help_express', async () => onExpressed(await helpExpressExperience(text)))}
            className="text-xs bg-linen-100 border border-linen-200 rounded-full px-3 py-1.5 text-ink-700 hover:border-sage-400 disabled:opacity-50"
          >
            {pending === 'help_express' ? t.aiAssist.expressing : t.aiAssist.express}
          </button>
        )}
        {onTitles && (
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => run('suggest_title', async () => onTitles(await suggestTitle(dishName || '', text)))}
            className="text-xs bg-linen-100 border border-linen-200 rounded-full px-3 py-1.5 text-ink-700 hover:border-sage-400 disabled:opacity-50"
          >
            {pending === 'suggest_title' ? t.aiAssist.thinking : t.aiAssist.suggestTitle}
          </button>
        )}
        {onTags && (
          <button
            type="button"
            disabled={pending !== null}
            onClick={() =>
              run('suggest_tags', async () => {
                const tags = await suggestSpiritTags(text);
                onTags(tags.filter(tag => (SPIRIT_TAGS as readonly string[]).includes(tag)));
              })
            }
            className="text-xs bg-linen-100 border border-linen-200 rounded-full px-3 py-1.5 text-ink-700 hover:border-sage-400 disabled:opacity-50"
          >
            {pending === 'suggest_tags' ? t.aiAssist.thinking : t.aiAssist.suggestTags}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-clay-700">{error}</p>}
    </div>
  );
}
