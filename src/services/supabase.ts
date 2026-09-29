import { createClient } from '@supabase/supabase-js';

export function isSupabaseConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

// Public posts are read and created directly from the browser using the
// anon key + Row Level Security (see db/schema.sql) — there is no API
// layer in between for this. The anon key is meant to be public; it only
// grants what the RLS policies explicitly allow.
//
// createClient() throws synchronously if the URL is missing, which would
// crash the whole app on import in an unconfigured environment — every
// caller must check isSupabaseConfigured() first (see postsApi.ts's
// callers in Home/Explore/Create) so this placeholder client is only ever
// constructed, never actually called, when unconfigured.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co',
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-anon-key',
);
