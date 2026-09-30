import { AiAssistError } from '../services/aiService';

// One place that turns an AI failure into the sentence the user sees, so
// each screen says the same thing. The "needs a vision model" hint is only
// shown when the provider itself rejected the image — never as a catch-all,
// because a model that replied but in a bad format (or a provider outage) is
// a different problem with a different fix.
export function aiErrorMessage(err: unknown, t: any): string {
  if (!(err instanceof AiAssistError)) return t.aiAssist.failed;
  switch (err.reason) {
    case 'no_api_key': return t.aiAssist.noKey;
    case 'rate_limited': return t.aiAssist.rateLimited;
    case 'no_vision': return t.create.photo.visionFailed;
    case 'bad_reply': return t.aiAssist.badReply;
    case 'provider': return t.aiAssist.providerError(err.status, err.message);
    case 'network': return t.aiAssist.failed;
    default: return t.aiAssist.failed;
  }
}
