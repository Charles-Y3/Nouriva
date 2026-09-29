import express from "express";
import { GoogleGenAI, Type } from "@google/genai";
import { put, del } from "@vercel/blob";
import { createClient } from "@supabase/supabase-js";

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
// app only handles the three things that genuinely need a server: the
// Gemini AI proxy (so a raw API key never has to be the only thing standing
// between a visitor and a working request), Vercel Blob photo uploads
// (needs a server-held write token), and admin moderation (needs the
// Supabase service role key, which must never reach the client).

const SPIRIT_TAG_VOCAB = [
  "Gratitude", "Peace", "Joy", "Compassion",
  "Connection", "Awareness", "Contentment", "Inspiration",
];

export function createApiApp() {
  const app = express();

  // Helper for Gemini AI initialization (supports server key or user custom key header).
  const getGenAI = (req?: express.Request) => {
    const customKey = (req?.headers['x-gemini-api-key'] as string | undefined)?.trim();
    const apiKey = customKey || process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    return new GoogleGenAI({ apiKey });
  };

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
  // the nutrition-estimate request's base64 photo (a downscaled ~1024px
  // JPEG comfortably fits well under this). The photo upload route below
  // parses raw bytes instead, scoped to just that one route, so it isn't
  // affected by this limit or JSON parsing.
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

  // Single flexible AI-assist endpoint. Every action shares the same
  // plumbing (auth header, no-key fallback, error shape), so one route
  // keeps that logic in one place rather than duplicated across four.
  app.post("/api/ai/assist", async (req, res) => {
    try {
      const { action, text, dishName, spiritTag } = req.body || {};

      const ai = getGenAI(req);
      if (!ai) {
        return res.status(503).json({
          error: "AI_UNAVAILABLE",
          code: "NO_API_KEY",
          message: "No Gemini API key is configured. Add your own key in Settings to use AI assistance.",
        });
      }

      let systemInstruction: string;
      let userPrompt: string;
      let responseMimeType: string | undefined = "application/json";

      switch (action) {
        case "improve_writing":
          if (!text) return res.status(400).json({ error: "text is required" });
          systemInstruction = `You gently polish a short personal reflection about a vegetarian dish and the feeling or experience it inspired, for the app Nouriva. Preserve the writer's own voice, meaning and first-person perspective — only smooth the wording. Do not invent details, emotions or spiritual claims the writer didn't express. Do not add religious framing. Keep it roughly the same length. Return a strict JSON object: { "result": string }.`;
          userPrompt = text;
          break;

        case "suggest_title":
          if (!text && !dishName) return res.status(400).json({ error: "text or dishName is required" });
          systemInstruction = `You suggest 3 short, warm, understated titles (3-6 words each) for a Nouriva post about a vegetarian dish and the personal reflection it inspired. No clickbait, no exclamation marks, no religious claims — quiet and genuine in tone. Return a strict JSON object: { "titles": string[] }.`;
          userPrompt = `Dish: ${dishName || "(untitled)"}\nReflection: ${text || "(none yet)"}`;
          break;

        case "help_express":
          if (!text) return res.status(400).json({ error: "text is required" });
          systemInstruction = `The writer has jotted a rough, partial note about what they felt while cooking, eating or sharing a vegetarian dish. Gently expand it into 2-4 warm, genuine sentences in first person, staying strictly within the feeling/meaning they already hinted at — never inventing a spiritual or religious interpretation they didn't suggest themselves. Return a strict JSON object: { "result": string }.`;
          userPrompt = text;
          break;

        case "suggest_tags":
          if (!text) return res.status(400).json({ error: "text is required" });
          systemInstruction = `From this reflection about a vegetarian dish, pick 1-3 tags that best match the feeling described, ONLY from this exact list: ${SPIRIT_TAG_VOCAB.join(", ")}. Return a strict JSON object: { "tags": string[] } using only tags from that list.`;
          userPrompt = text;
          break;

        case "inspire_dish":
          if (!spiritTag || !SPIRIT_TAG_VOCAB.includes(spiritTag)) {
            return res.status(400).json({ error: "spiritTag must be one of: " + SPIRIT_TAG_VOCAB.join(", ") });
          }
          systemInstruction = `You suggest ONE simple, practical vegetarian dish idea for someone who wants to cook something that evokes the feeling "${spiritTag}", for the app Nouriva. Use common, easy-to-find ingredients — not an exotic or hard-to-source dish. Keep it achievable for a home cook. Do not add religious framing or claim the dish itself has spiritual properties — just explain briefly, in warm plain language, why preparing or sharing this dish suits that feeling (e.g. the ritual of making it, who it's shared with, what it's made of). Return a strict JSON object: { "dishName": string, "blurb": string (1-2 sentences), "ingredients": string (a short newline-separated list), "recipe": string (a short rough method, 2-4 sentences) }.`;
          userPrompt = `Feeling: ${spiritTag}`;
          break;

        default:
          return res.status(400).json({ error: "Unknown action" });
      }

      const response = await ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: userPrompt,
        config: { systemInstruction, responseMimeType },
      });

      const resultText = (response.text || "{}").replace(/^```(json)?/i, '').replace(/```$/, '').trim();
      res.json(JSON.parse(resultText));
    } catch (err: any) {
      console.error("AI assist error:", err);
      const msg = String(err?.message || '');
      if (err?.status === 429 || /quota|rate limit|resource_exhausted/i.test(msg)) {
        return res.status(429).json({ error: "Rate limited", code: "RATE_LIMITED", details: msg });
      }
      res.status(500).json({ error: "AI assist failed", details: msg });
    }
  });

  // Nutrition estimate from a photo — separate from /api/ai/assist since it
  // takes an image, not just text, and returns a fixed structured shape
  // (responseSchema) rather than a free-form result. Mirrors living-in-harmony's
  // /api/ai/food-analysis pattern. Nouriva isn't a nutrition database — this
  // is an optional, editable estimate the author can accept, tweak, or clear
  // entirely before sharing, never an automatic or authoritative figure.
  app.post("/api/ai/nutrition", async (req, res) => {
    try {
      const { imageBase64, mimeType = 'image/jpeg' } = req.body || {};
      if (!imageBase64) return res.status(400).json({ error: "imageBase64 is required" });

      const ai = getGenAI(req);
      if (!ai) {
        return res.status(503).json({
          error: "AI_UNAVAILABLE",
          code: "NO_API_KEY",
          message: "No Gemini API key is configured. Add your own key in Settings to use AI assistance.",
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

      const systemInstruction = `You are a careful nutrition-estimation assistant analyzing a single vegetarian dish photo. Estimate calories and macros for the exact quantity visible, using visible scale cues (plate/bowl size, portion). Account for hidden but likely ingredients typical of the dish (cooking oil, dressing, sauce) rather than only what's directly visible. When uncertain, prefer a realistic middle estimate over the leanest possible reading. All numbers are estimates, not lab measurements.`;

      const response = await ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: [
          { inlineData: { mimeType: detectedMime, data: cleanBase64 } },
          { text: "Estimate calories and macros for this dish." },
        ],
        config: {
          systemInstruction,
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              calories: { type: Type.NUMBER, description: "Estimated total calories (kcal) for the quantity pictured" },
              carbsGrams: { type: Type.NUMBER },
              proteinGrams: { type: Type.NUMBER },
              fatGrams: { type: Type.NUMBER },
              fiberGrams: { type: Type.NUMBER },
            },
            required: ["calories", "carbsGrams", "proteinGrams", "fatGrams", "fiberGrams"],
          },
        },
      });

      let resultText = response.text || "{}";
      resultText = resultText.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
      const nutrition = JSON.parse(resultText);
      res.json({ ...nutrition, isAiEstimate: true });
    } catch (err: any) {
      console.error("AI nutrition error:", err);
      const msg = String(err?.message || '');
      if (err?.status === 429 || /quota|rate limit|resource_exhausted/i.test(msg)) {
        return res.status(429).json({ error: "Rate limited", code: "RATE_LIMITED", details: msg });
      }
      res.status(500).json({ error: "Nutrition estimate failed", details: msg });
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
