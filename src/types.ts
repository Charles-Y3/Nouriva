export type NavTab = 'browse' | 'create' | 'my-nouriva' | 'settings';

export type Language = 'en' | 'zh-Hant' | 'zh-Hans';

export const SPIRIT_TAGS = [
  'Gratitude', 'Peace', 'Joy', 'Compassion',
  'Connection', 'Awareness', 'Contentment', 'Inspiration',
] as const;
export type SpiritTag = typeof SPIRIT_TAGS[number];

export type ReactionType = 'felt' | 'inspired' | 'thanks';

export const FONT_SIZES = ['sm', 'md', 'lg', 'xl'] as const;
export type FontSize = typeof FONT_SIZES[number];

export interface NutritionEstimate {
  calories?: number;
  carbsGrams?: number;
  proteinGrams?: number;
  fatGrams?: number;
  fiberGrams?: number;
  // Present only when AI-estimated (vs. left blank / hand-entered later) —
  // lets the UI show "AI estimate" instead of implying a lab measurement.
  isAiEstimate?: boolean;
}

// A published post, exactly as it lives in Supabase (see db/schema.sql).
export interface Post {
  id: string;
  dish_name: string;
  description: string | null;
  photo_url: string | null;
  ingredients: string | null;
  recipe: string | null;
  reflection: string;
  spirit_tags: string[];
  nutrition: NutritionEstimate | null;
  created_at: string;
  reaction_felt_count: number;
  reaction_inspired_count: number;
  reaction_thanks_count: number;
  report_count: number;
  status: 'visible' | 'hidden';
}

// An in-progress, unpublished post — local-only until Share.
export interface Draft {
  id: string;
  dishName: string;
  reflection: string;
  photoDraftId?: string;
  photoPreviewDataUrl?: string;
  ingredients?: string;
  recipe?: string;
  spiritTags: string[];
  nutrition?: NutritionEstimate;
  createdAt: number;
  updatedAt: number;
}

export interface MyPostRef {
  id: string;
  publishedAt: number;
}

// User-supplied AI provider config — deliberately generic, not tied to one
// vendor. baseUrl defaults to Groq's OpenAI-compatible endpoint but can
// point anywhere that speaks the same chat-completions protocol (OpenAI,
// Gemini's own OpenAI-compatibility endpoint, Together, a local Ollama/LM
// Studio server, etc).
export interface AiProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface UserPreferences {
  completedIntro: boolean;
  language: Language;
  fontSize: FontSize;
  // Ciphertext (passphrase-encrypted, see services/keyEncryption.ts) — the
  // whole AiProviderConfig, JSON-stringified before encrypting. Persisted
  // in nouriva_preferences, travels with any future data export.
  aiProviderEncrypted?: string;
  // Plaintext, unlocked copy — deliberately NOT persisted as part of the
  // nouriva_preferences blob (see AppContext.tsx); held only in memory here
  // plus a separately device-wrapped copy in its own localStorage slot.
  // `null` (vs. undefined) is the explicit "cleared" sentinel — see
  // useAiProviderManager.ts's clearProvider().
  customAiProvider?: AiProviderConfig | null;
}
