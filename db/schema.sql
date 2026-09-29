-- Nouriva public post store — run this once in the Supabase SQL editor
-- (Project → SQL Editor → New query → paste this whole file → Run).
--
-- Design notes:
--  * Anonymous visitors INSERT and SELECT posts directly from the browser
--    (see src/services/supabase.ts, src/services/postsApi.ts) — there is no
--    server-side API layer for reading/creating posts, only for AI, photo
--    uploads and admin moderation (see api/_app.ts). This mirrors Supabase's
--    standard anon-key + Row Level Security model.
--  * Reactions and reports are NOT plain UPDATEs from the client. RLS
--    governs whole rows, not individual columns, so an anon-writable UPDATE
--    policy on `report_count` would still need a trigger to reject edits to
--    every other column. Two narrow SECURITY DEFINER RPCs (below) are a
--    simpler way to guarantee only that one counter can ever move.
--  * Admin moderation (hide/unhide/delete) is NOT exposed to anon at all —
--    it goes through /api/admin/* using the service role key, server-side
--    only (see api/_app.ts and README's "Moderation" section).

-- 1. Table --------------------------------------------------------------

create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  dish_name text not null check (char_length(dish_name) between 1 and 120),
  description text check (char_length(description) <= 2000),
  photo_url text,
  ingredients text check (char_length(ingredients) <= 4000),
  recipe text check (char_length(recipe) <= 4000),
  reflection text not null check (char_length(reflection) between 1 and 4000),
  spirit_tags text[] not null default '{}',
  -- Optional {calories, carbsGrams, proteinGrams, fatGrams, fiberGrams,
  -- isAiEstimate} — either AI-estimated (see /api/ai/nutrition) or
  -- hand-entered by the author. Nouriva isn't a nutrition database, but a
  -- post is free to carry this alongside its reflection when it's useful.
  nutrition jsonb,
  created_at timestamptz not null default now(),

  reaction_felt_count int not null default 0,
  reaction_inspired_count int not null default 0,
  reaction_thanks_count int not null default 0,

  report_count int not null default 0,
  status text not null default 'visible' check (status in ('visible', 'hidden')),

  -- Full-text search across the fields visitors actually search by — kept
  -- in sync by a trigger below (NOT a `generated ... stored` column: every
  -- to_tsvector() variant, even with the config cast to regconfig, is
  -- marked STABLE rather than IMMUTABLE in Postgres's catalog — text
  -- search dictionaries are themselves mutable objects (ALTER TEXT SEARCH
  -- DICTIONARY), so Postgres conservatively refuses to call it IMMUTABLE
  -- under any argument form. A generated column requires IMMUTABLE, so
  -- to_tsvector can never go in one — this is a hard Postgres limitation,
  -- not a bug in this schema. A BEFORE INSERT/UPDATE trigger has no such
  -- restriction and is the standard workaround.
  -- array_to_string flattens spirit_tags into the same tsvector so tag
  -- words are searchable too, not just filterable via .contains() (see
  -- postsApi.ts's tag param). Uses the 'simple' text search config (no
  -- English stemming) since posts can be in English, Traditional or
  -- Simplified Chinese; note Postgres's built-in tsvector has no real CJK
  -- word segmentation, so Chinese search degrades to substring-ish
  -- matching on whatever the default parser tokenizes out, not true
  -- Chinese word-aware search — acceptable for v1, worth revisiting (e.g.
  -- a CJK-aware search config) if search quality on Chinese content turns
  -- out to matter more than expected.
  search_vector tsvector
);

create index if not exists posts_created_at_idx on posts (created_at desc) where status = 'visible';
create index if not exists posts_search_idx on posts using gin (search_vector);

create or replace function posts_update_search_vector()
returns trigger
language plpgsql
as $$
begin
  new.search_vector :=
    setweight(to_tsvector('simple', coalesce(new.dish_name, '')), 'A') ||
    setweight(to_tsvector('simple', array_to_string(new.spirit_tags, ' ')), 'A') ||
    setweight(to_tsvector('simple', coalesce(new.reflection, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(new.ingredients, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(new.recipe, '')), 'C');
  return new;
end;
$$;

drop trigger if exists posts_search_vector_trigger on posts;
create trigger posts_search_vector_trigger
  before insert or update on posts
  for each row execute function posts_update_search_vector();

-- 2. Row Level Security ---------------------------------------------------

alter table posts enable row level security;

-- Anonymous INSERT is allowed, but a crafted request can't seed fake social
-- proof or publish pre-hidden/pre-reported: every counter must start at 0
-- and status must start 'visible'.
drop policy if exists posts_insert_anon on posts;
create policy posts_insert_anon on posts for insert to anon
  with check (
    reaction_felt_count = 0
    and reaction_inspired_count = 0
    and reaction_thanks_count = 0
    and report_count = 0
    and status = 'visible'
  );

-- Anonymous SELECT only sees visible posts — a hidden post is as good as
-- deleted to the public; admin can still reach it via the service role key.
drop policy if exists posts_select_anon on posts;
create policy posts_select_anon on posts for select to anon
  using (status = 'visible');

-- Deliberately no anon UPDATE/DELETE policy at all. The only mutation
-- paths for anon are the two RPCs below (SECURITY DEFINER, so they run as
-- the table owner regardless of the caller's own RLS grants) and the
-- service-role-key admin routes in api/_app.ts.

-- 3. RPCs -------------------------------------------------------------

create or replace function react_to_post(post_id uuid, reaction text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if reaction = 'felt' then
    update posts set reaction_felt_count = reaction_felt_count + 1 where id = post_id and status = 'visible';
  elsif reaction = 'inspired' then
    update posts set reaction_inspired_count = reaction_inspired_count + 1 where id = post_id and status = 'visible';
  elsif reaction = 'thanks' then
    update posts set reaction_thanks_count = reaction_thanks_count + 1 where id = post_id and status = 'visible';
  else
    raise exception 'invalid reaction type: %', reaction;
  end if;
end;
$$;

grant execute on function react_to_post(uuid, text) to anon;

create or replace function report_post(post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update posts set report_count = report_count + 1 where id = post_id and status = 'visible';
end;
$$;

grant execute on function report_post(uuid) to anon;
