import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const BUCKET =
  process.env.NEXT_PUBLIC_SUPABASE_BUCKET || "art_photos";

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // IMPORTANT: don't crash the build; only crash when actually used
  if (!url || !anon) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  _client = createClient(url, anon);
  return _client;
}

export function publicUrl(path: string): string {
  const { data } = getSupabase().storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}