// src/lib/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || "art_photos";

/**
 * Returns a public URL for a file stored in Supabase Storage.
 * Works for PUBLIC buckets. If you make the bucket private later,
 * you’ll want signed URLs instead.
 */
export function publicUrl(storagePath: string) {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}