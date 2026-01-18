// lib/supabaseClient.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
export const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
export const BUCKET = (process.env.NEXT_PUBLIC_SUPABASE_BUCKET ?? "art_photos").trim();

function assertEnv() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __supabaseClient: SupabaseClient | undefined;
}

export function getSupabase(): SupabaseClient {
  assertEnv();

  if (typeof window === "undefined") {
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }

  if (globalThis.__supabaseClient) return globalThis.__supabaseClient;

  globalThis.__supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: window.localStorage,
      storageKey: "sb-auth-token", // stable key (not required, but helps debugging)
    },
  });

  return globalThis.__supabaseClient;
}

export function publicUrl(path: string): string {
  if (!SUPABASE_URL) return "";
  const cleanBase = SUPABASE_URL.replace(/\/+$/, "");
  const cleanPath = path.replace(/^\/+/, "");
  return `${cleanBase}/storage/v1/object/public/${BUCKET}/${cleanPath}`;
}