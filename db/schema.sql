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

-- 4. Baseline content filter (defense-in-depth) -----------------------

-- Mirrors src/utils/contentFilter.ts's denylist — that client-side check
-- is what a normal user actually sees (an inline error before Share is
-- even clickable), but nothing stops a request that bypasses the UI
-- entirely and calls the REST API directly with the anon key. This CHECK
-- constraint is the backstop for that case. It's a blunt keyword list, not
-- real moderation — report + the admin routes in api/_app.ts remain the
-- actual mechanism for anything this can't catch (see README's
-- "Moderation" section). Safe to re-run: the guard below skips re-adding
-- the constraint if it already exists.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'posts_no_blocked_content') then
    alter table posts add constraint posts_no_blocked_content check (
      lower(
        coalesce(dish_name, '') || ' ' || coalesce(description, '') || ' ' ||
        coalesce(reflection, '') || ' ' || coalesce(ingredients, '') || ' ' ||
        coalesce(recipe, '')
      ) !~ (
        'fuck|shit|bitch|asshole|bastard|cunt|dick|piss|' ||
        'nigger|nigga|faggot|retard|whore|slut|rape|kill\s*yourself|kys|' ||
        '操你|傻逼|傻屄|婊子|賤人|贱人|白痴|智障|死全家|干你娘|幹你娘'
      )
    );
  end if;
end $$;


-- 5. Categories, share keys, author hide/show, anti-spam --------------
--
-- Safe to re-run (idempotent). Adds, on top of the sections above:
--  * category      one of a fixed list per post (Browse filter).
--  * reaction_total generated sum of the three reaction counters — lets
--                  Browse sort by "popular" in a single ORDER BY.
--  * owner_key_hash SHA-256 of the secret key the sharing device holds.
--                  Author actions (hide / show again / edit) go through
--                  server routes in api/_app.ts that check the key; the key
--                  itself is never stored. Hash of a 256-bit random secret,
--                  so it's harmless even though anon can read the row.
--  * author_hidden the author's own hide switch. Separate from `status`,
--                  which stays the moderator's sticky switch — a moderator
--                  removal can't be undone by the author.
--  * device_id / ip_hash / content_hash and a trigger that rate-limits
--                  new shares (5 per device and 15 per IP per 24h) and
--                  rejects duplicate content. Not bulletproof without
--                  accounts (clearing storage gives a new device_id) — the
--                  IP and content checks are the backstop.

alter table posts add column if not exists category text;
alter table posts add column if not exists owner_key_hash text;
alter table posts add column if not exists author_hidden boolean not null default false;
alter table posts add column if not exists device_id text;
alter table posts add column if not exists ip_hash text;
alter table posts add column if not exists content_hash text;
alter table posts add column if not exists reshare_window_start timestamptz;
alter table posts add column if not exists reshare_count int not null default 0;
alter table posts add column if not exists last_toggled_at timestamptz;

do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'posts' and column_name = 'reaction_total') then
    alter table posts add column reaction_total int
      generated always as (reaction_felt_count + reaction_inspired_count + reaction_thanks_count) stored;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'posts_category_valid') then
    alter table posts add constraint posts_category_valid check (
      category is null or category in ('Main', 'Soup', 'Salad', 'Breakfast', 'Snack', 'Dessert', 'Bakery', 'Drink')
    );
  end if;
end $$;

create index if not exists posts_popular_idx on posts (reaction_total desc, created_at desc) where status = 'visible';
create index if not exists posts_device_idx on posts (device_id, created_at desc);
create index if not exists posts_ip_idx on posts (ip_hash, created_at desc);
create index if not exists posts_content_hash_idx on posts (content_hash);

create or replace function posts_guard()
returns trigger
language plpgsql
as $$
declare
  hdrs json;
  ip text;
begin
  begin
    hdrs := current_setting('request.headers', true)::json;
  exception when others then
    hdrs := null;
  end;
  ip := split_part(coalesce(hdrs ->> 'x-forwarded-for', hdrs ->> 'x-real-ip', ''), ',', 1);

  new.content_hash := md5(lower(
    coalesce(new.dish_name, '') || '|' || coalesce(new.reflection, '') || '|' ||
    coalesce(new.ingredients, '') || '|' || coalesce(new.recipe, '')
  ));

  if tg_op = 'INSERT' then
    new.ip_hash := case when ip = '' then null else md5(ip) end;
    if new.device_id is not null and (
      select count(*) from posts where device_id = new.device_id and created_at > now() - interval '24 hours'
    ) >= 5 then
      raise exception 'nouriva_rate_limit';
    end if;
    if new.ip_hash is not null and (
      select count(*) from posts where ip_hash = new.ip_hash and created_at > now() - interval '24 hours'
    ) >= 15 then
      raise exception 'nouriva_rate_limit';
    end if;
  end if;

  if exists (select 1 from posts where content_hash = new.content_hash and id <> new.id) then
    raise exception 'nouriva_duplicate';
  end if;
  return new;
end;
$$;

drop trigger if exists posts_guard_trigger on posts;
create trigger posts_guard_trigger
  before insert or update of dish_name, reflection, ingredients, recipe on posts
  for each row execute function posts_guard();

-- Anon may only publish a fresh, visible post that carries a key hash.
drop policy if exists posts_insert_anon on posts;
create policy posts_insert_anon on posts for insert to anon
  with check (
    reaction_felt_count = 0
    and reaction_inspired_count = 0
    and reaction_thanks_count = 0
    and report_count = 0
    and status = 'visible'
    and author_hidden = false
    and owner_key_hash is not null
    and char_length(owner_key_hash) = 64
    and reshare_count = 0
  );

-- Browse only ever sees posts that are neither moderator-hidden nor
-- author-hidden. Authors read their own hidden posts through the key-checked
-- /api/my/posts route instead.
drop policy if exists posts_select_anon on posts;
create policy posts_select_anon on posts for select to anon
  using (status = 'visible' and author_hidden = false);

create or replace function react_to_post(post_id uuid, reaction text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if reaction = 'felt' then
    update posts set reaction_felt_count = reaction_felt_count + 1 where id = post_id and status = 'visible' and author_hidden = false;
  elsif reaction = 'inspired' then
    update posts set reaction_inspired_count = reaction_inspired_count + 1 where id = post_id and status = 'visible' and author_hidden = false;
  elsif reaction = 'thanks' then
    update posts set reaction_thanks_count = reaction_thanks_count + 1 where id = post_id and status = 'visible' and author_hidden = false;
  else
    raise exception 'invalid reaction type: %', reaction;
  end if;
end;
$$;

create or replace function report_post(post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update posts set report_count = report_count + 1 where id = post_id and status = 'visible' and author_hidden = false;
end;
$$;


-- 6. AI + admin review before a post goes public ----------------------
--
-- Safe to re-run. New posts are inserted as 'pending' (invisible to the
-- public). Only the server (service role) can flip a post to 'visible':
-- /api/posts/:id/screen does it when the AI check says the post is clean;
-- anything flagged, or anything the AI check couldn't judge, stays
-- 'pending' until the admin approves it (-> 'visible') or denies it
-- (-> 'hidden') on the /review page. A browser can no longer publish a post
-- straight to 'visible', even with the anon key.
--  * moderation_note  why a post is waiting (AI reasons / "not screened").
--  * screened_at      set once when the server claims a post for screening,
--                     so the AI check can only be run once per post.

alter table posts add column if not exists moderation_note text;
alter table posts add column if not exists screened_at timestamptz;

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'posts'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%' and pg_get_constraintdef(oid) ilike '%visible%'
  loop
    execute format('alter table posts drop constraint %I', c.conname);
  end loop;
  alter table posts add constraint posts_status_check check (status in ('visible', 'hidden', 'pending'));
end $$;

create index if not exists posts_pending_idx on posts (created_at) where status = 'pending';

drop policy if exists posts_insert_anon on posts;
create policy posts_insert_anon on posts for insert to anon
  with check (
    reaction_felt_count = 0
    and reaction_inspired_count = 0
    and reaction_thanks_count = 0
    and report_count = 0
    and status = 'pending'
    and author_hidden = false
    and owner_key_hash is not null
    and char_length(owner_key_hash) = 64
    and reshare_count = 0
    and moderation_note is null
    and screened_at is null
  );
