# Nouriva

Nouriva — Nourish the body. Elevate the spirit.

A simple, local-first, no-accounts web app for sharing vegetarian dishes and the moments of
spiritual elevation they inspire. The focus isn't "what did you eat" but "what did this food
awaken within you." A post is never required to carry more than a dish name and a reflection —
but calorie/macro estimates and full recipes are welcome and first-class when you want to include
them; the reflection just stays the visual and emotional center of every post, not a footnote to
the numbers.

Nouriva is **not** a diet app, restaurant review platform, conventional social network, religious
platform, or medical app — nutrition data here is an optional, editable estimate attached to a
post someone chose to share, never a tracked log of what you personally ate over time.

## Run locally

```bash
npm install
cp .env.example .env
```

Fill in `.env` — see the comments in `.env.example` for where each value comes from. At minimum
you'll need your own free [Supabase](https://supabase.com) project and a
[Vercel Blob](https://vercel.com/docs/storage/vercel-blob) store; this repo can't provision those
for you.

```bash
npm run dev
```

Opens at http://localhost:3000. Without Supabase/Blob configured, the app still runs — Browse and
Create both show an honest "not connected yet" state instead of failing silently.

## Database setup

Run [`db/schema.sql`](db/schema.sql) once in your Supabase project's SQL editor (Project → SQL
Editor → New query → paste the whole file → Run). This creates the `posts` table, its Row Level
Security policies, the full-text search index behind Browse's search bar, and the two RPCs
(`react_to_post`, `report_post`) the app calls directly from the browser. The file is idempotent —
re-run it after pulling an update: section 5 adds categories, share keys, author hide/show and the
anti-spam trigger to an existing database (Browse fails to load until it has been run).
**Section 8 (language versions, mandatory fields) must be run BEFORE deploying the app version that
uses it**: the new app reads columns that only exist after it.

## Deploying to Vercel

1. Push this repo to GitHub and import it into Vercel.
2. Set the env vars from `.env.example` in the Vercel project settings.
3. Connect a Blob store via the project's Storage tab — this auto-injects
   `BLOB_READ_WRITE_TOKEN`.
4. Redeploy.

## Optional: AI assistance

Nouriva talks to AI through a generic OpenAI-compatible chat-completions client (`api/_app.ts`) —
not locked to one vendor. `AI_BASE_URL`/`AI_API_KEY`/`AI_MODEL` set a server-wide fallback
(defaults to Groq, which has a free tier), or each visitor can paste their own base URL, key, and
model in Settings — Groq, OpenAI, Gemini's own OpenAI-compatibility endpoint
(`https://generativelanguage.googleapis.com/v1beta/openai`), Together, Fireworks, or a local
runtime (Ollama, LM Studio) all work, since they all speak the same protocol. A visitor's config is
encrypted with a passphrase they choose (PBKDF2 + AES-GCM) before it's ever written to storage, and
a separately device-wrapped copy (a non-extractable IndexedDB key) lets the app stay usable across
closes without asking for the passphrase every time. See `src/services/keyEncryption.ts` and
`src/services/deviceKeyStore.ts` for the details.

AI covers writing assists (improve wording, suggest a title, help express a half-formed thought,
suggest spirit tags), identifying a dish from its photo (dish name, a rough ingredient list and
method, and a nutrition estimate, all in one call — Create's photo step, which now comes first, so
the rest of the form can start pre-filled), and "Inspire me" (Browse's button for "I don't know
what to cook" — pick a feeling, get a dish idea with a rough ingredient list and method, pre-filled
straight into Create if you want to run with it). It's never invoked automatically — only when a
visitor taps an assist button, and a one-time notice discloses that their content is being sent to
the configured AI provider. Anything AI drafts (dish name, ingredients, recipe, nutrition, dish
ideas) is always editable and clearable before sharing, and the reflection field is never
AI-written — that one stays the author's own words. Inspire me also surfaces real posts other
people already shared under the chosen feeling, so it stays useful even with no AI key configured —
it only fully degrades to nothing if the deployment has neither Supabase nor an AI key set up.
Note that photo-based features (identify-from-photo, Inspire me's suggestions are text-only so
unaffected) need a vision-capable model — if you or a visitor picks a text-only model, those calls
will simply fail with the same honest error handling as any other AI failure.

**Language and diet.** Every AI-written value follows the app's language setting (the client sends
it with each request; "improve writing" keeps the writer's own language). Browse's "Inspire me" is
constrained to Buddhist-style vegetarian — no meat/fish, and none of onion, garlic, chives, green
onion, leek or asafoetida (eggs and dairy are fine): stated in the prompt, and *enforced* by a
deterministic English + Chinese ingredient filter (`api/_dietFilter.ts`) that regenerates or drops
any suggestion that breaks the rule. The default model is `qwen/qwen3.8-27b` (vision-capable);
any model works, but photo features need one that accepts images.

## Moderation

Before a post can be shared, `src/utils/contentFilter.ts`'s keyword denylist blocks the most
unambiguous cases (slurs, explicit profanity) with an inline error, and the same list backs a
Postgres CHECK constraint (see `db/schema.sql`) so a request that bypasses the UI entirely can't
slip through either. This is a blunt, always-on baseline that needs no AI key — it can't catch
anything requiring judgment (illegal activity described in clean language, non-slur harassment,
misinformation), which is what report + admin review remain for. Sharing also requires an explicit
"share this publicly?" confirmation.

**Author controls (share keys).** There are no accounts, so authorship is proven by a secret key
generated on the sharing device: only its SHA-256 is stored on the post (`owner_key_hash`); the
key is kept with the post's entry in "Shared by you" and included in the backup (JSON export and
folder auto-save), and the person never sees or handles it. With the key an author can **unshare** a post
(hide it from Browse), **share it again**, **edit** it or **delete** it for good (My Nouriva → Shared by you) —
routes `/api/my/posts`, `/api/posts/:id/visibility`, `/api/posts/:id/edit` and
`/api/posts/:id/delete`, which need `SUPABASE_SERVICE_ROLE_KEY`. Unsharing never deletes: likes, reports and the key survive, and people
who saved or liked the dish keep their copy. Showing again re-uses the same post and key (never
mints a new one), is rate-limited (3 per day, 5-minute gap), and is refused for a post a moderator
removed — `status = 'hidden'` (moderator) is separate from `author_hidden` (author). Edits pass the
same baseline content filter and duplicate check as new posts. New shares are rate-limited by a
database trigger (5 per device and 15 per IP per 24 h) and identical content is rejected; without
accounts this is a deterrent, not a guarantee (clearing storage yields a new device id).

Anyone can report a post from its detail page. There's no in-app admin UI in v1 — moderate via
`curl` against the secret-gated `/api/admin/*` routes, using the `ADMIN_SECRET` you set:

```bash
# List posts with at least one report, most-reported first
curl -H "x-admin-secret: $ADMIN_SECRET" https://your-deployment.vercel.app/api/admin/reported-posts

# Hide a post (removes it from Browse/direct links, keeps the row)
curl -X POST -H "x-admin-secret: $ADMIN_SECRET" https://your-deployment.vercel.app/api/admin/posts/<id>/hide

# Unhide it
curl -X POST -H "x-admin-secret: $ADMIN_SECRET" https://your-deployment.vercel.app/api/admin/posts/<id>/unhide

# Permanently delete it (and best-effort delete its photo)
curl -X DELETE -H "x-admin-secret: $ADMIN_SECRET" https://your-deployment.vercel.app/api/admin/posts/<id>
```

### AI screening and the review queue

Every new dish (and every edit) is checked before it appears in Browse:

1. The browser saves the dish as `pending` — the only status the database lets it write.
2. `POST /api/posts/:id/screen` (author's share key required, runs once per post) sends the text and
   photo to the screening model (`MODERATION_API_KEY`, default model `qwen/qwen3.8-27b`).
3. Only a well-formed `clean` verdict makes the dish `visible`. A flag, a rate limit, a timeout, an
   unreadable reply, a missing key or a photo not hosted on Nouriva storage leaves it `pending`.
4. Pending dishes appear on **`/review`** (enter `ADMIN_SECRET`) where you Approve (-> visible) or
   Deny (-> hidden). If `RESEND_API_KEY` and `ADMIN_EMAIL` are set, you also get an email.
5. The author sees "Waiting for review" (the same message whether flagged or not screened) and is
   never shown the AI's reason.

Run the `db/schema.sql` section 6 once in Supabase before deploying this. The model only proposes;
the word-block filter, the database constraint and the Report button remain as backstops, and a
cleverly worded post can still fool an AI check.

## Language

English, Traditional Chinese (繁體中文), and Simplified Chinese (简体中文) — chosen at first
launch (auto-detected from the browser as a starting guess) and changeable anytime in Settings.
All UI strings live in `src/i18n/translations.ts`; there's no i18n library, just a plain object
indexed by the active language.

### One language per reader (translation)

Every post keeps exactly what its author typed and, once live, gets a generated version in the
other language (English <-> Chinese). A reader sees every post, in the author's own text or the
generated one, **in their settings language only**; Traditional/Simplified Chinese is converted on
the device (`opencc-js`, loaded only for Chinese readers). A post whose translation isn't ready
yet shows its original with a small "Original · translating" tag. Drafts stay local, as typed;
nothing is translated until Share.

- Code: `api/_translate.ts` (the gate and the queue), routes in `api/_app.ts`, picking the
  version in `src/services/postLocale.ts`.
- The model only proposes. A translation is stored only if code accepts it: exact fields, length
  limits, same line count, every number kept, nothing the baseline filter blocks, no non-vegetarian
  word the source didn't have. Otherwise it is retried once, then dropped (readers keep the original).
- Model: the server's own key (`TRANSLATE_API_KEY`, else `AI_API_KEY`, else the moderation key),
  never a key from a request. On Groq the default model is `openai/gpt-oss-120b` (override with
  `TRANSLATE_MODEL`): the Qwen model used for moderation allows only 1,000 output tokens per
  minute on the free tier, too little for one recipe, and a separate model keeps translation's
  quota apart from moderation's.
- Limits: a short per-minute limit is waited out; a longer one pauses the queue (state in the
  `translation_state` table), and if the wait is 10+ minutes you get one email (same
  `RESEND_API_KEY`/`ADMIN_EMAIL` as moderation), then one more when it has caught up. The queue
  resumes by itself: a daily Vercel cron (`vercel.json`, `/api/translate/run`; Hobby plans allow
  daily only) plus a throttled nudge from Browse when it sees a post still waiting.
- Existing posts (from before this feature) are queued by an admin call, after a dry run that
  returns the translations for review without saving anything:

  ```bash
  curl -X POST $APP/api/admin/translate-backfill -H "x-admin-secret: $ADMIN_SECRET" \
    -H "Content-Type: application/json" -d '{"dryRun": true}'
  curl -X POST $APP/api/admin/translate-backfill -H "x-admin-secret: $ADMIN_SECRET" \
    -H "Content-Type: application/json" -d '{}'
  ```
- Tests: `npm run test:translate` (the gate, the queue, quota pause/resume) and
  `npm run test:routes` (screen/edit/translate routes against an in-memory database).

New posts must include ingredients, a method and at least one feeling (photo is optional); this
is checked in the form, in `/api/posts/:id/edit` and in the database's insert policy.

## Install as an app (PWA)

Nouriva is installable — an icon on your home screen, full-screen, no browser chrome. Chrome/Edge
show an "Install Nouriva" button in Settings once the browser decides the app qualifies; on
iOS Safari (which never offers an automatic prompt), Settings shows manual "Add to Home Screen"
instructions instead. The service worker (`public/sw.js`) exists for installability and safe
update rollout, not full offline browsing — it deliberately fetches the app shell network-first so
a redeploy never leaves a visitor stuck on a stale build pointing at bundle files that no longer
exist.

The app icon (favicon, header mark, home-screen icon) is generated from `src/assets/icon-source.jpg`
— see `public/icon-*.png`. It's cropped to a circle and re-exported at each needed size (32/64 for
favicons, 192/512 for the manifest, 180 for `apple-touch-icon`, plus a padded `icon-maskable-512.png`
for OS icon masking) since the source is a flat JPEG with no real transparency.

## Local-first data model

- **Browser-only, never leaves your device**: drafts in progress (including any not-yet-shared
  photo and nutrition estimate), display/language preferences, your encrypted AI key, and a list
  of which reactions/reports you've already given (a soft per-device nicety, not an enforced
  limit).
- **Public, in Supabase**: only what you explicitly publish by tapping Share in Create — dish
  name, description, photo, ingredients, recipe, reflection, spirit tags, nutrition estimate (if
  any), and the reaction/report counters. There is no account system and no server-side record of
  who published what beyond a purely local list on your own device (`My Nouriva`).

Because published posts already live in Supabase, clearing this browser's storage never deletes
the posts themselves — but it does lose in-progress drafts, and your device's own record of which
posts are yours (`My Nouriva`'s "Shared by you" list is purely local, so a wipe makes those posts
just look like anyone else's — you can't get that list back by asking Supabase who you are, since
there's no accounts). Settings offers two ways to protect all of that: a manual "Export/Import
local data as JSON" (works everywhere, including iOS Safari; covers drafts, the "Shared by you"
list, and your reaction/report history), and on Chromium desktop browsers, "auto-backup to a
folder" — pick a folder once and every change silently overwrites one JSON file there via the File
System Access API, so it all survives even a full browser storage wipe. Choosing that folder again
after a wipe both restores the data and re-arms auto-save in one step. See `src/utils/backup.ts`
and `src/utils/folderBackup.ts` for exactly how (and the latter's limits — it's Chromium-only, and
the permission it holds can be silently revoked by the browser, in which case auto-save just stops
rather than erroring).

If you have unprotected drafts (folder auto-backup isn't on) that have sat around for a few days,
a small dismissible reminder nudges you to back them up — "Back up now" triggers the same
export/folder flow as Settings. See `src/utils/backupReminder.ts` for the exact cadence.

Every delete-ish action in the app (removing a draft, removing your saved AI key, turning off
folder auto-backup, clearing all local data) asks for confirmation first — nothing destructive is
ever a single click.

## Search

Browse's search bar runs Postgres full-text search (a generated `tsvector` column + GIN index
across dish name, reflection, ingredients, recipe, and spirit tags — see `db/schema.sql`) directly
from the browser via the same anon-key + RLS model as everything else. No separate search service.
Note: Postgres's built-in text search has no real Chinese word segmentation, so search quality on
Chinese content is weaker than on English for now — flagged in `db/schema.sql`'s comments as worth
revisiting if it matters more than expected.

## Recipe booklet (PDF)

My Nouriva → "Recipe booklet (PDF)" lets you pick any mix of posts you've shared, posts you've
reacted to, and saved dishes, and generates a magazine-style PDF: a cover (masthead, issue line,
hero photo), a contents page, an optional editor's note (this week's story), one recipe feature per
page (hero photo, pull-quote, ingredients sidebar, numbered method — layouts alternate), and a back
cover with a dedication. Each recipe fits on one page (the type shrinks and the photo gives up height as needed) and shows its
nutrition estimate when it has one. The Nouriva mark and a link to the app (https://nouriva.qolife.app) are on the cover and back
cover. Choose a title, dedication and one of four colour themes. Generated
entirely client-side — `@react-pdf/renderer` is lazy-loaded only when you generate one. Chinese
gets Noto Serif/Sans SC/TC (fetched from a CDN on demand, plus the small punctuation subsets those
fonts need); react-pdf can't wrap CJK without printing a stray "-" at each break, so Chinese
paragraphs are wrapped by hand. See `src/services/recipeBooklet.tsx`.

**Folder auto-backup** saves one `nouriva-backup.json` to a folder you choose, a moment after any change to
drafts (with their full-size photos), "Shared by you" (with author keys), preferences (including the
encrypted AI config), reactions or reports. Settings → "Restore from a backup folder" brings all of it
back, photos included.

## Stories

The Stories tab shows one fixed, short reflective story per week of the year (52 in all, with
reflective questions and a "cook something to match" button that opens Inspire me on the story's
feeling). Not AI-generated: each is a traditional tale retold in our own words or an original
written for Nouriva (labelled as such). Sources live in `src/data/stories-src/` (English +
Traditional Chinese); `npm run build:stories` derives Simplified Chinese with OpenCC and writes
`src/data/stories.json`. The Traditional/Simplified text deserves a native-speaker review.

## Out of scope / not built (v1)

- A picklist of named AI providers in the UI (bring-your-own base URL/key/model instead)
- Threaded comments (only the three fixed reactions: ♡ ✨ 🙏)
- Push notifications
- Any account, profile, or follower system
- An admin UI (curl-only moderation for now)
- CJK-aware full-text search (current search is substring-ish on Chinese content, see above)
