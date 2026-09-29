import { decryptForDevice } from './deviceKeyStore';

export type AiUnavailableReason = 'no_api_key' | 'rate_limited' | 'network' | 'unknown';

export class AiAssistError extends Error {
  reason: AiUnavailableReason;
  constructor(reason: AiUnavailableReason, message: string) {
    super(message);
    this.reason = reason;
    this.name = 'AiAssistError';
  }
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const wrapped = localStorage.getItem('nouriva_gemini_api_key_local');
    if (wrapped) {
      const plainKey = await decryptForDevice(wrapped);
      if (plainKey) headers['x-gemini-api-key'] = plainKey;
    }
  } catch {
    // No usable local key — request still goes through, server falls back
    // to its own GEMINI_API_KEY (if configured) or returns NO_API_KEY.
  }
  return headers;
}

async function postJson(endpoint: string, body: Record<string, unknown>): Promise<any> {
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify(body),
    });
  } catch {
    throw new AiAssistError('network', 'Could not reach the AI assist service.');
  }

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    if (res.status === 503 && payload.code === 'NO_API_KEY') {
      throw new AiAssistError('no_api_key', payload.message || 'No Gemini API key is configured.');
    }
    if (res.status === 429) {
      throw new AiAssistError('rate_limited', 'The AI service is rate-limited right now — try again shortly.');
    }
    throw new AiAssistError('unknown', payload.details || payload.error || 'AI assist failed.');
  }
  return res.json();
}

function callAssist(body: Record<string, unknown>) {
  return postJson('/api/ai/assist', body);
}

export async function improveWriting(text: string): Promise<string> {
  const { result } = await callAssist({ action: 'improve_writing', text });
  return result;
}

export async function suggestTitle(dishName: string, text: string): Promise<string[]> {
  const { titles } = await callAssist({ action: 'suggest_title', dishName, text });
  return titles;
}

export async function helpExpressExperience(text: string): Promise<string> {
  const { result } = await callAssist({ action: 'help_express', text });
  return result;
}

export async function suggestSpiritTags(text: string): Promise<string[]> {
  const { tags } = await callAssist({ action: 'suggest_tags', text });
  return tags;
}

export interface DishSuggestion {
  dishName: string;
  blurb: string;
  ingredients: string;
  recipe: string;
}

export async function inspireDish(spiritTag: string): Promise<DishSuggestion> {
  return callAssist({ action: 'inspire_dish', spiritTag });
}

export interface NutritionEstimateResult {
  calories: number;
  carbsGrams: number;
  proteinGrams: number;
  fatGrams: number;
  fiberGrams: number;
  isAiEstimate: true;
}

export async function estimateNutrition(imageBase64: string, mimeType: string): Promise<NutritionEstimateResult> {
  return postJson('/api/ai/nutrition', { imageBase64, mimeType });
}
