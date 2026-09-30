import { decryptForDevice } from './deviceKeyStore';
import type { NutritionEstimate } from '../types';

export type AiUnavailableReason = 'no_api_key' | 'rate_limited' | 'network' | 'diet' | 'unknown';

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
    const wrapped = localStorage.getItem('nouriva_ai_provider_local');
    if (wrapped) {
      const plain = await decryptForDevice(wrapped);
      if (plain) {
        const config = JSON.parse(plain);
        if (config.baseUrl) headers['x-ai-base-url'] = config.baseUrl;
        if (config.apiKey) headers['x-ai-api-key'] = config.apiKey;
        if (config.model) headers['x-ai-model'] = config.model;
      }
    }
  } catch {
    // No usable local config — request still goes through, server falls
    // back to its own AI_* env vars (if configured) or returns NO_API_KEY.
  }
  return headers;
}

// Everything the AI writes (titles, recipes, dish ideas…) follows the app's
// language setting, so the server is told which one on every request.
function getUiLanguage(): string {
  try {
    return JSON.parse(localStorage.getItem('nouriva_preferences') || '{}').language || 'en';
  } catch {
    return 'en';
  }
}

async function postJson(endpoint: string, body: Record<string, unknown>): Promise<any> {
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ ...body, language: getUiLanguage() }),
    });
  } catch {
    throw new AiAssistError('network', 'Could not reach the AI assist service.');
  }

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    if (res.status === 503 && payload.code === 'NO_API_KEY') {
      throw new AiAssistError('no_api_key', payload.message || 'No AI provider is configured.');
    }
    if (payload.code === 'DIET_VIOLATION') {
      throw new AiAssistError('diet', 'Could not find a suggestion that fits the vegetarian guidelines.');
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

export interface FoodIdentification {
  dishName: string;
  ingredients: string;
  recipe: string;
  nutrition: NutritionEstimate;
}

export async function identifyFood(imageBase64: string, mimeType: string): Promise<FoodIdentification> {
  return postJson('/api/ai/identify-food', { imageBase64, mimeType });
}
