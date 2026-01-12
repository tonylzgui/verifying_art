import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || "art_photos";

if (!supabaseUrl || !supabaseAnonKey) {
  // This makes the production error obvious instead of a vague crash
  throw new Error(
    `Missing Supabase env vars. NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is undefined.`
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export function publicUrl(path: string) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}