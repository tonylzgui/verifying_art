import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key || !/^https?:\/\//.test(url)) {
    if (typeof window === "undefined") {
      _client = createClient("https://example.com", "public-anon-key-placeholder");
      return _client;
    }
    throw new Error("Missing or invalid NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  _client = createClient(url, key);
  return _client;
}

export const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || "art_photos";

export function publicUrl(path: string) {
  const { data } = getSupabase().storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}