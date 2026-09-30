import express from "express";
import { put, del } from "@vercel/blob";
import { createClient } from "@supabase/supabase-js";
import { createHash, timingSafeEqual } from "node:crypto";
import { findDietViolation } from "./_dietFilter";

// All API route handlers, as a standalone Express app with no listen()/Vite/
// static-file serving of its own — shared by two hosts:
//  - server.ts (traditional Node hosting / local dev): mounts this app, adds
//    Vite dev middleware or static `dist/` serving, then calls .listen().
//  - api/index.ts (Vercel serverless): exports this app directly, since
//    an Express app's (req, res) signature is exactly what Vercel's Node
//    runtime expects from a serverless function.
//
// Note on what does NOT go through this server: reading/creating posts and
// reacting/reporting all happen directly from the browser via
// src/services/supabase.ts + Row Level Security (see db/schema.sql) — this
// app only handles the three things that genuinely need a server: the AI
// proxy (so a raw API key never has to be the only thing standing between a
// visitor and a working request), Vercel Blob photo uploads (needs a
// server-held write token), and admin moderation (needs the Supabase
// service role key, which must never reach the client).

const CATEGORY_VOCAB = ["Main", "Soup", "Salad", "Breakfast", "Snack", "Dessert", "Bakery", "Drink"];

const SPIRIT_TAG_VOCAB = [
  "Gratitude", "Peace", "Joy", "Compassion",
  "Connection", "Awareness", "Contentment", "Inspiration",
];

// Generic OpenAI-compatible chat-completions client — NOT tied to one
// vendor. Groq, OpenAI itself, Gemini's own OpenAI-compatibility endpoint
// (generativelanguage.googleapis.com/v1beta/openai), Together, Fireworks,
// and local runtimes (Ollama, LM Studio) all speak this same protocol, so
// "bring your own base URL + key + model" covers all of them with one code
// path instead of a per-vendor SDK. Defaults point at Groq (fast, has a
// generous free tier) but every part is overridable per-request via
// headers, so a visitor's own Settings choice always wins over the
// server's fallback env vars.
interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

function getAiConfig(req?: express.Request): AiConfig | null {
  const headerBaseUrl = (req?.headers['x-ai-base-url'] as string | undefined)?.trim();
  const headerApiKey = (req?.headers['x-ai-api-key'] as string | undefined)?.trim();
  const headerModel = (req?.headers['x-ai-model'] as string | undefined)?.trim();

  const baseUrl = (headerBaseUrl || process.env.AI_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/+$/, '');
  const apiKey = headerApiKey || process.env.AI_API_KEY;
  const model = headerModel || process.env.AI_MODEL || 'qwen/qwen3.8-27b';

  if (!apiKey) return null;
  return { baseUrl, apiKey, model };
}

// `response_format: json_object` isn't universally supported across
// OpenAI-compatible providers/local models, so instead of depending on it,
// the system prompt itself demands strict JSON and this strips a markdown
// code fence if the model wraps its answer in one anyway (common even when
// asked not to).
function extractJson(text: string): any {
  // Reasoning models (e.g. Qwen3) may prefix the answer with a <think>…</think>
  // block, and some wrap the JSON in prose — take the outermost {...} only.
  const noThink = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  const cleaned = noThink.replace(/^\s*```(json)?/i, '').replace(/```\s*$/, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  return JSON.parse(start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned);
}

// Every AI-written value follows the app's language setting (the client
// sends it with each request). JSON keys and fixed vocabularies stay English.
function languageInstruction(lang: unknown): string {
  if (lang === 'zh-Hant') return ' Write every text value in Traditional Chinese (繁體中文). JSON keys stay in English.';
  if (lang === 'zh-Hans') return ' Write every text value in Simplified Chinese (简体中文). JSON keys stay in English.';
  return ' Write every text value in English. JSON keys stay in English.';
}

const DIET_RULE = ' The dish must be strictly vegetarian in the Buddhist vegetarian style: no meat, poultry, fish or seafood, no fish sauce, oyster sauce or animal stock, and NONE of the five pungent vegetables — onion, garlic, chives, green onion (scallion) or leek — nor asafoetida (hing), including in sauces, pastes and stock powders. Eggs and dairy are allowed. Use ginger, mushrooms, herbs, spices, sesame, citrus and similar for depth of flavour instead.';

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

function keyMatches(storedHash: string | null | undefined, key: unknown): boolean {
  if (!storedHash || typeof key !== 'string' || key.length < 16 || key.length > 200) return false;
  const a = Buffer.from(hashKey(key));
  const b = Buffer.from(storedHash);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Same list as src/utils/contentFilter.ts and the posts_no_blocked_content
// CHECK in db/schema.sql — edits made through the owner route are checked
// here too, so editing can't be used to slip past the baseline filter.
const BLOCKED_PATTERN =
  /fuck|shit|bitch|asshole|bastard|cunt|dick|piss|nigger|nigga|faggot|retard|whore|slut|rape|kill\s*yourself|\bkys\b|操你|傻逼|傻屄|婊子|賤人|贱人|白痴|智障|死全家|干你娘|幹你娘/i;

async function callChatCompletion(config: AiConfig, system: string, userContent: unknown): Promise<string> {
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.7,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err: any = new Error(`AI provider returned ${res.status}${body ? `: ${body.slice(0, 500)}` : ''}`);
    err.status = res.status;
    throw err;
  }
  const data: any = await res.json();
  return data?.choices?.[0]?.message?.content || '{}';
}

// Models are loose about key names and types; accept the common variants and
// coerce, but require an actual dish name.
function normalizeFood(raw: any) {
  const text = (v: unknown) => (Array.isArray(v) ? v.join("\n") : typeof v === "string" ? v : undefined);
  const num = (v: unknown) => {
    const n = typeof v === "string" ? parseFloat(v) : v;
    return typeof n === "number" && Number.isFinite(n) ? n : undefined;
  };
  const dishName = text(raw?.dishName ?? raw?.dish_name ?? raw?.name ?? raw?.dish)?.trim();
  if (!dishName) throw new Error("no dish name in reply");
  return {
    dishName,
    ingredients: text(raw.ingredients),
    recipe: text(raw.recipe ?? raw.method),
    calories: num(raw.calories),
    carbsGrams: num(raw.carbsGrams ?? raw.carbs),
    proteinGrams: num(raw.proteinGrams ?? raw.protein),
    fatGrams: num(raw.fatGrams ?? raw.fat),
    fiberGrams: num(raw.fiberGrams ?? raw.fiber),
  };
}

export function createApiApp() {
  const app = express();

  const getSupabaseAdmin = () => {
    const url = process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) return null;
    return createClient(url, serviceKey);
  };

  function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
    const expected = process.env.ADMIN_SECRET;
    const provided = req.headers['x-admin-secret'];
    if (!expected || provided !== expected) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  }

  // JSON body limit covers both the small text-only AI-assist requests and
  // the identify-food request's base64 photo (a downscaled ~1600px JPEG
  // comfortably fits well under this). The photo upload route below parses
  // raw bytes instead, scoped to just that one route, so it isn't affected
  // by this limit or JSON parsing.
  app.use(express.json({ limit: '8mb' }));

  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Payload too large' });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Invalid request body', details: err.message });
    }
    next(err);
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // Tells the client WHY an AI call failed, so it doesn't have to guess:
  //  - RATE_LIMITED   provider said slow down
  //  - NO_VISION      the provider itself rejected the image / content format
  //                   (only ever inferred from the provider's own error, and
  //                   only for requests that carried an image)
  //  - PROVIDER_ERROR any other HTTP error from the provider (status + text)
  //  - BAD_REPLY      the model DID answer, but not in a usable form
  function handleAiError(err: any, res: express.Response, failedMessage: string, withImage = false) {
    console.error("AI error:", err);
    const msg = String(err?.message || '');
    if (err?.status === 429 || /quota|rate limit/i.test(msg)) {
      return res.status(429).json({ error: "Rate limited", code: "RATE_LIMITED", details: msg });
    }
    if (typeof err?.status === 'number') {
      const rejectsImage = withImage && [400, 404, 415, 422].includes(err.status)
        && /image|vision|multimodal|multi-modal|modalit|image_url|content.*(string|array)/i.test(msg);
      return res.status(502).json({
        error: failedMessage,
        code: rejectsImage ? "NO_VISION" : "PROVIDER_ERROR",
        providerStatus: err.status,
        details: msg.slice(0, 300),
      });
    }
    if (err?.code === 'BAD_REPLY' || err instanceof SyntaxError) {
      return res.status(502).json({ error: failedMessage, code: "BAD_REPLY", details: "The model replied, but not in a usable format." });
    }
    res.status(500).json({ error: failedMessage, details: msg.slice(0, 300) });
  }

  // Single flexible AI-assist endpoint. Every action shares the same
  // plumbing (auth headers, no-key fallback, error shape), so one route
  // keeps that logic in one place rather than duplicated across four.
  app.post("/api/ai/assist", async (req, res) => {
    try {
      const { action, text, dishName, spiritTag, language } = req.body || {};
      const langRule = languageInstruction(language);

      const config = getAiConfig(req);
      if (!config) {
        return res.status(503).json({
          error: "AI_UNAVAILABLE",
          code: "NO_API_KEY",
          message: "No AI provider is configured. Add your own API key in Settings to use AI assistance.",
        });
      }

      let systemInstruction: string;
      let userPrompt: string;

      switch (action) {
        case "improve_writing":
          if (!text) return res.status(400).json({ error: "text is required" });
          systemInstruction = `You gently polish a short personal reflection about a vegetarian dish and the feeling or experience it inspired, for the app Nouriva. Preserve the writer's own voice, meaning and first-person perspective — only smooth the wording. Do not invent details, emotions or spiritual claims the writer didn't express. Do not add religious framing. Keep it roughly the same length. Return ONLY a strict JSON object, no markdown, no commentary: { "result": string }. Keep the writer's own language — do not translate.`;
          userPrompt = text;
          break;

        case "suggest_title":
          if (!text && !dishName) return res.status(400).json({ error: "text or dishName is required" });
          systemInstruction = `You suggest 3 short, warm, understated titles (3-6 words each) for a Nouriva post about a vegetarian dish and the personal reflection it inspired. No clickbait, no exclamation marks, no religious claims — quiet and genuine in tone. Return ONLY a strict JSON object, no markdown, no commentary: { "titles": string[] }.${langRule}`;
          userPrompt = `Dish: ${dishName || "(untitled)"}\nReflection: ${text || "(none yet)"}`;
          break;

        case "help_express":
          if (!text) return res.status(400).json({ error: "text is required" });
          systemInstruction = `The writer has jotted a rough, partial note about what they felt while cooking, eating or sharing a vegetarian dish. Gently expand it into 2-4 warm, genuine sentences in first person, staying strictly within the feeling/meaning they already hinted at — never inventing a spiritual or religious interpretation they didn't suggest themselves. Return ONLY a strict JSON object, no markdown, no commentary: { "result": string }.${langRule}`;
          userPrompt = text;
          break;

        case "suggest_tags":
          if (!text) return res.status(400).json({ error: "text is required" });
          systemInstruction = `From this reflection about a vegetarian dish, pick 1-3 tags that best match the feeling described, ONLY from this exact list: ${SPIRIT_TAG_VOCAB.join(", ")}. Return ONLY a strict JSON object, no markdown, no commentary: { "tags": string[] } using only tags from that list.`;
          userPrompt = text;
          break;

        case "inspire_dish":
          if (!spiritTag || !SPIRIT_TAG_VOCAB.includes(spiritTag)) {
            return res.status(400).json({ error: "spiritTag must be one of: " + SPIRIT_TAG_VOCAB.join(", ") });
          }
          systemInstruction = `You suggest ONE simple, practical vegetarian dish idea for someone who wants to cook something that evokes the feeling "${spiritTag}", for the app Nouriva. Use common, easy-to-find ingredients — not an exotic or hard-to-source dish. Keep it achievable for a home cook. Do not add religious framing or claim the dish itself has spiritual properties — just explain briefly, in warm plain language, why preparing or sharing this dish suits that feeling (e.g. the ritual of making it, who it's shared with, what it's made of). Return ONLY a strict JSON object, no markdown, no commentary: { "dishName": string, "blurb": string (1-2 sentences), "ingredients": string (a short newline-separated list), "recipe": string (a short rough method, 2-4 sentences) }.${DIET_RULE}${langRule}`;
          userPrompt = `Feeling: ${spiritTag}`;
          break;

        default:
          return res.status(400).json({ error: "Unknown action" });
      }

      if (action === "inspire_dish") {
        // A model only proposes: every suggestion is scanned by the
        // deterministic diet filter before it reaches the user. A failing
        // one is regenerated (told what to avoid); after 3 tries we give up
        // rather than show a dish that breaks the rule.
        let feedback = "";
        for (let attempt = 0; attempt < 3; attempt++) {
          const content = await callChatCompletion(config, systemInstruction + feedback, userPrompt);
          const suggestion = extractJson(content);
          for (const k of ["ingredients", "recipe"]) {
            if (Array.isArray(suggestion[k])) suggestion[k] = suggestion[k].join("\n");
          }
          const violation = findDietViolation([suggestion.dishName, suggestion.blurb, suggestion.ingredients, suggestion.recipe].filter(Boolean).join(" "));
          if (!violation) return res.json(suggestion);
          feedback = ` Your previous idea used "${violation}", which is not allowed. Suggest a different dish with none of the forbidden ingredients.`;
        }
        return res.status(502).json({ error: "Could not produce a diet-compliant suggestion", code: "DIET_VIOLATION" });
      }

      const content = await callChatCompletion(config, systemInstruction, userPrompt);
      res.json(extractJson(content));
    } catch (err: any) {
      handleAiError(err, res, "AI assist failed");
    }
  });

  // Identify a dish from a photo — separate from /api/ai/assist since it
  // takes an image, not just text. In one call: dish name, a rough
  // ingredient list, a rough method, and a nutrition estimate — all
  // optional, editable, author-reviewed fields the person can accept,
  // tweak, or clear entirely on the next Create step. Never presented as
  // authoritative; Nouriva isn't a recipe or nutrition database.
  app.post("/api/ai/identify-food", async (req, res) => {
    try {
      const { imageBase64, mimeType = 'image/jpeg', language } = req.body || {};
      if (!imageBase64) return res.status(400).json({ error: "imageBase64 is required" });

      const config = getAiConfig(req);
      if (!config) {
        return res.status(503).json({
          error: "AI_UNAVAILABLE",
          code: "NO_API_KEY",
          message: "No AI provider is configured. Add your own API key in Settings to use AI assistance.",
        });
      }

      let cleanBase64 = imageBase64;
      let detectedMime = mimeType || 'image/jpeg';
      if (imageBase64.includes(';base64,')) {
        const parts = imageBase64.split(';base64,');
        cleanBase64 = parts[1];
        const mimeMatch = parts[0].match(/^data:(image\/[a-zA-Z0-9+.-]+)/);
        if (mimeMatch) detectedMime = mimeMatch[1];
      }
      if (detectedMime === 'image/jpg') detectedMime = 'image/jpeg';
      cleanBase64 = cleanBase64.replace(/[\r\n\s]/g, '');

      const systemInstruction = `You are a careful assistant identifying a single vegetarian dish from a photo, for the app Nouriva. Name the specific dish, list its likely main ingredients, sketch a short rough method, and estimate calories/macros for the quantity visible (using scale cues like the plate/bowl size; account for likely hidden ingredients such as cooking oil or dressing rather than only what's directly visible — when uncertain, prefer a realistic middle estimate). Everything here is a starting draft the person will review and edit themselves, not a final answer — keep it concise and plausible rather than exhaustive. Return ONLY a strict JSON object, no markdown, no commentary: { "dishName": string, "ingredients": string (short newline-separated list), "recipe": string (2-4 sentence rough method), "calories": number, "carbsGrams": number, "proteinGrams": number, "fatGrams": number, "fiberGrams": number }.${languageInstruction(language)}`;

      // The model may answer with prose, stray keys or an empty reply; try
      // once more before calling it a bad reply. Anything the provider itself
      // rejects (HTTP error) is thrown straight through instead.
      let parsed: any;
      for (let attempt = 0; attempt < 2; attempt++) {
        const content = await callChatCompletion(config, systemInstruction, [
          { type: 'text', text: 'Identify this dish and draft the fields described.' },
          { type: 'image_url', image_url: { url: `data:${detectedMime};base64,${cleanBase64}` } },
        ]);
        try {
          parsed = normalizeFood(extractJson(content));
          break;
        } catch {
          if (attempt === 1) {
            const bad: any = new Error('The model replied, but not in a usable format');
            bad.code = 'BAD_REPLY';
            throw bad;
          }
        }
      }
      res.json({
        dishName: parsed.dishName,
        ingredients: parsed.ingredients,
        recipe: parsed.recipe,
        nutrition: {
          calories: parsed.calories,
          carbsGrams: parsed.carbsGrams,
          proteinGrams: parsed.proteinGrams,
          fatGrams: parsed.fatGrams,
          fiberGrams: parsed.fiberGrams,
          isAiEstimate: true,
        },
      });
    } catch (err: any) {
      handleAiError(err, res, "Food identification failed", true);
    }
  });

  // Photo upload — raw bytes straight to Vercel Blob. Needs a server hop
  // only because BLOB_READ_WRITE_TOKEN must never reach the browser; the
  // resulting public URL is then written into the posts row directly from
  // the client via Supabase (see src/services/postsApi.ts).
  app.post(
    "/api/upload-photo",
    express.raw({ type: () => true, limit: '15mb' }),
    async (req, res) => {
      try {
        if (!process.env.BLOB_READ_WRITE_TOKEN) {
          return res.status(503).json({ error: "PHOTO_UPLOAD_UNAVAILABLE", message: "Photo storage is not configured on this server." });
        }
        if (!req.body || !(req.body instanceof Buffer) || req.body.length === 0) {
          return res.status(400).json({ error: "Request body must be the raw image bytes" });
        }
        const contentType = req.headers['content-type'] || 'image/jpeg';
        const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
        const blob = await put(`posts/${crypto.randomUUID()}.${ext}`, req.body, {
          access: 'public',
          contentType,
          token: process.env.BLOB_READ_WRITE_TOKEN,
        });
        res.json({ url: blob.url });
      } catch (err: any) {
        console.error("Photo upload error:", err);
        res.status(500).json({ error: "Photo upload failed", details: err.message });
      }
    }
  );

  // --- Author controls (hide / show again / edit) ---------------------
  //
  // Sharing is anonymous, so authorship is proven by a secret key the sharing
  // device generated (and keeps, in "Shared by you" + its backup). Only the
  // key's SHA-256 is stored on the post (posts.owner_key_hash). These routes
  // run with the service role and check the key themselves, since anon has
  // no UPDATE rights at all. Design rules:
  //  - Hiding never deletes: likes, reports and the key survive, so the post
  //    can be shown again — with the SAME key, never a new one (a re-share
  //    can't be used to mint fresh posts).
  //  - A moderator removal (status = 'hidden') is sticky: the author can't
  //    undo it.
  //  - Showing again is rate-limited; hiding (the safe direction) is not.
  //  - Edits go through the same baseline content filter as new posts.
  const OWNER_COLUMNS = 'id, dish_name, description, photo_url, ingredients, recipe, reflection, spirit_tags, category, nutrition, created_at, reaction_felt_count, reaction_inspired_count, reaction_thanks_count, report_count, status, author_hidden';
  const RESHARE_LIMIT_PER_DAY = 3;
  const RESHARE_MIN_GAP_MS = 5 * 60 * 1000;
  const DAY_MS = 24 * 60 * 60 * 1000;

  app.post("/api/my/posts", async (req, res) => {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: "OWNER_ROUTES_UNAVAILABLE" });
    const refs = Array.isArray(req.body?.refs) ? req.body.refs.slice(0, 100) : [];
    const valid = refs.filter((r: any) => r && typeof r.id === 'string' && typeof r.key === 'string');
    if (valid.length === 0) return res.json({ posts: [] });
    const { data, error } = await supabase
      .from('posts')
      .select(OWNER_COLUMNS + ', owner_key_hash')
      .in('id', valid.map((r: any) => r.id));
    if (error) return res.status(500).json({ error: error.message });
    const keyById = new Map<string, string>(valid.map((r: any) => [r.id, r.key]));
    const posts = (data || [])
      .filter((row: any) => keyMatches(row.owner_key_hash, keyById.get(row.id)))
      .map(({ owner_key_hash, ...rest }: any) => rest);
    res.json({ posts });
  });

  app.post("/api/posts/:id/visibility", async (req, res) => {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: "OWNER_ROUTES_UNAVAILABLE" });
    const { key, hidden } = req.body || {};
    if (typeof hidden !== 'boolean') return res.status(400).json({ error: "hidden must be true or false" });

    const { data: row, error } = await supabase
      .from('posts')
      .select('owner_key_hash, status, author_hidden, reshare_window_start, reshare_count, last_toggled_at')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!row || !keyMatches(row.owner_key_hash, key)) return res.status(403).json({ error: "Forbidden" });
    if (row.status === 'hidden') {
      return res.status(403).json({ error: "Removed by a moderator", code: "REMOVED_BY_MODERATOR" });
    }
    if (row.author_hidden === hidden) return res.json({ status: "ok", author_hidden: hidden });

    const now = Date.now();
    const update: Record<string, unknown> = { author_hidden: hidden, last_toggled_at: new Date(now).toISOString() };
    if (!hidden) {
      // Showing again: cap per day and require a short gap after hiding.
      const windowStart = row.reshare_window_start ? Date.parse(row.reshare_window_start) : 0;
      const inWindow = windowStart && now - windowStart < DAY_MS;
      const count = inWindow ? row.reshare_count : 0;
      const lastToggle = row.last_toggled_at ? Date.parse(row.last_toggled_at) : 0;
      if (count >= RESHARE_LIMIT_PER_DAY || (lastToggle && now - lastToggle < RESHARE_MIN_GAP_MS)) {
        return res.status(429).json({ error: "Too many re-shares", code: "TOGGLE_LIMIT" });
      }
      update.reshare_window_start = new Date(inWindow ? windowStart : now).toISOString();
      update.reshare_count = count + 1;
    }
    const { error: updateError } = await supabase.from('posts').update(update).eq('id', req.params.id);
    if (updateError) return res.status(500).json({ error: updateError.message });
    res.json({ status: "ok", author_hidden: hidden });
  });

  app.post("/api/posts/:id/edit", async (req, res) => {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: "OWNER_ROUTES_UNAVAILABLE" });
    const { key, dishName, description, photoUrl, ingredients, recipe, reflection, spiritTags, category, nutrition } = req.body || {};

    if (typeof dishName !== 'string' || !dishName.trim() || typeof reflection !== 'string' || !reflection.trim()) {
      return res.status(400).json({ error: "dishName and reflection are required" });
    }
    if (category != null && !CATEGORY_VOCAB.includes(category)) return res.status(400).json({ error: "Unknown category" });
    const tags = Array.isArray(spiritTags) ? spiritTags.filter((t: unknown) => SPIRIT_TAG_VOCAB.includes(t as string)) : [];
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
    if (BLOCKED_PATTERN.test([dishName, description, reflection, ingredients, recipe].filter(Boolean).join(' '))) {
      return res.status(422).json({ error: "Blocked content", code: "BLOCKED_CONTENT" });
    }
    if (typeof photoUrl === 'string' && photoUrl && !/^https:\/\//i.test(photoUrl)) {
      return res.status(400).json({ error: "photoUrl must be an https URL" });
    }

    const { data: row, error } = await supabase
      .from('posts')
      .select('owner_key_hash, status')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!row || !keyMatches(row.owner_key_hash, key)) return res.status(403).json({ error: "Forbidden" });
    if (row.status === 'hidden') {
      return res.status(403).json({ error: "Removed by a moderator", code: "REMOVED_BY_MODERATOR" });
    }

    const { error: updateError } = await supabase.from('posts').update({
      dish_name: dishName.trim(),
      description: str(description),
      photo_url: str(photoUrl),
      ingredients: str(ingredients),
      recipe: str(recipe),
      reflection: reflection.trim(),
      spirit_tags: tags,
      category: category ?? null,
      nutrition: nutrition && typeof nutrition === 'object' ? nutrition : null,
    }).eq('id', req.params.id);
    if (updateError) {
      const msg = String(updateError.message || '');
      if (msg.includes('nouriva_duplicate')) return res.status(409).json({ error: "Duplicate", code: "DUPLICATE" });
      return res.status(500).json({ error: msg });
    }
    res.json({ status: "ok" });
  });

  // --- Admin moderation (secret-header-gated, no UI in v1 — see README) ---

  app.get("/api/admin/reported-posts", requireAdmin, async (req, res) => {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: "Admin moderation is not configured on this server." });
    const { data, error } = await supabase
      .from('posts')
      .select('id, dish_name, reflection, report_count, status, created_at')
      .gt('report_count', 0)
      .order('report_count', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ posts: data });
  });

  app.post("/api/admin/posts/:id/hide", requireAdmin, async (req, res) => {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: "Admin moderation is not configured on this server." });
    const { error } = await supabase.from('posts').update({ status: 'hidden' }).eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ status: "ok" });
  });

  app.post("/api/admin/posts/:id/unhide", requireAdmin, async (req, res) => {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: "Admin moderation is not configured on this server." });
    const { error } = await supabase.from('posts').update({ status: 'visible' }).eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ status: "ok" });
  });

  app.delete("/api/admin/posts/:id", requireAdmin, async (req, res) => {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: "Admin moderation is not configured on this server." });
    const { data: existing } = await supabase.from('posts').select('photo_url').eq('id', req.params.id).single();
    const { error } = await supabase.from('posts').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    if (existing?.photo_url && process.env.BLOB_READ_WRITE_TOKEN) {
      // Best-effort — a failed blob cleanup shouldn't fail the delete, the
      // row is already gone and that's what matters for moderation.
      del(existing.photo_url, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch(err =>
        console.error("Best-effort blob delete failed:", err)
      );
    }
    res.json({ status: "ok" });
  });

  return app;
}
