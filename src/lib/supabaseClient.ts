import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
export const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
export const BUCKET = (process.env.NEXT_PUBLIC_SUPABASE_BUCKET ?? "art_photos").trim();

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_client) return _client;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Missing or invalid NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return _client;
}

/**
 * Build-safe public URL generator (does NOT call supabase-js).
 * This avoids build-time crashes if Next evaluates things during prerender.
 */
export function publicUrl(path: string): string {
  if (!SUPABASE_URL) return "";
  const cleanBase = SUPABASE_URL.replace(/\/+$/, "");
  const cleanPath = path.replace(/^\/+/, "");
  return `${cleanBase}/storage/v1/object/public/${BUCKET}/${cleanPath}`;
}