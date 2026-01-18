// lib/supabaseClient.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
export const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
export const BUCKET = (process.env.NEXT_PUBLIC_SUPABASE_BUCKET ?? "art_photos").trim();

// ✅ Singleton client (one instance for the whole browser session)
let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  // If we're on the server, always create a fresh client (avoids leaking across requests)
  if (typeof window === "undefined") {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
    }
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  // Browser: reuse the same instance forever
  if (_client) return _client;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,        // store session in storage
      autoRefreshToken: true,      // keep tokens fresh
      detectSessionInUrl: true,    // supports magic links / recovery links
    },
  });

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