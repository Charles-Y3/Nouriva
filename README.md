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
(`react_to_post`, `report_post`) the app calls directly from the browser.

## Deploying to Vercel

1. Push this repo to GitHub and import it into Vercel.
2. Set the env vars from `.env.example` in the Vercel project settings.
3. Connect a Blob store via the project's Storage tab — this auto-injects
   `BLOB_READ_WRITE_TOKEN`.
4. Redeploy.

## Optional: AI assistance

Set `GEMINI_API_KEY` as a server-wide fallback, or let each visitor paste their own key in
Settings. A visitor's key is encrypted with a passphrase they choose (PBKDF2 + AES-GCM) before
it's ever written to storage, and a separately device-wrapped copy (a non-extractable IndexedDB
key) lets the app stay usable across closes without asking for the passphrase every time. See
`src/services/keyEncryption.ts` and `src/services/deviceKeyStore.ts` for the details.

AI covers writing assists (improve wording, suggest a title, help express a half-formed thought,
suggest spirit tags), an optional nutrition estimate from a dish photo, and "Inspire me" (Browse's
button for "I don't know what to cook" — pick a feeling, get a dish idea with a rough ingredient
list and method, pre-filled straight into Create if you want to run with it). It's never invoked
automatically — only when a visitor taps an assist button, and a one-time notice discloses that
their content is being sent to Gemini. A nutrition estimate is always editable and clearable
before sharing, and clearly marked as an AI estimate, never presented as measured fact. Inspire me
also surfaces real posts other people already shared under the chosen feeling, so it stays useful
even with no Gemini key configured — it only fully degrades to nothing if the deployment has
neither Supabase nor a Gemini key set up.

## Moderation

Before a post can be shared, `src/utils/contentFilter.ts`'s keyword denylist blocks the most
unambiguous cases (slurs, explicit profanity) with an inline error, and the same list backs a
Postgres CHECK constraint (see `db/schema.sql`) so a request that bypasses the UI entirely can't
slip through either. This is a blunt, always-on baseline that needs no AI key — it can't catch
anything requiring judgment (illegal activity described in clean language, non-slur harassment,
misinformation), which is what report + admin review remain for. Sharing also requires an explicit
"share this publicly?" confirmation that states up front there's no self-service takedown
afterward — deliberate: without accounts, there's no reliable way to prove who authored a post, so
an anon-callable "delete your own post" action would just be a public delete button anyone could
use on anyone's post.

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

## Language

English, Traditional Chinese (繁體中文), and Simplified Chinese (简体中文) — chosen at first
launch (auto-detected from the browser as a starting guess) and changeable anytime in Settings.
All UI strings live in `src/i18n/translations.ts`; there's no i18n library, just a plain object
indexed by the active language.

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

## Out of scope / not built (v1)

- Multiple AI providers (Gemini only)
- Threaded comments (only the three fixed reactions: ♡ ✨ 🙏)
- Push notifications
- Any account, profile, or follower system
- An admin UI (curl-only moderation for now)
- CJK-aware full-text search (current search is substring-ish on Chinese content, see above)
