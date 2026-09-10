import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * When the two env vars are missing the app runs entirely in the browser on
 * seeded data. That keeps a static deploy useful before the database exists,
 * and it means a broken backend never leaves a blank screen in front of a
 * marker or a stakeholder.
 */
export const isLive = Boolean(url && key);

export const supabase = isLive
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

export const PHOTO_BUCKET = "item-photos";

export function publicPhotoUrl(path) {
  if (!isLive || !path) return null;
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}
