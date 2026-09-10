/**
 * Storage cleanup. Deleting an item row removes its item_images rows, but the
 * files themselves stay in the bucket, so every deleted path is queued in
 * storage_gc. This drains that queue.
 *
 * Run locally with `npm run gc`, or let the GitHub Action do it weekly.
 * Needs SUPABASE_SERVICE_ROLE_KEY — never expose that key to the browser.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

// Purge anything that has aged past its retention window, then clear the files.
const { data: purged, error: purgeErr } = await db.rpc("purge_resolved_items");
if (purgeErr) console.warn("purge_resolved_items:", purgeErr.message);
else console.log(`Purged ${purged ?? 0} report(s) down to their marks.`);

const { data: queue, error } = await db.from("storage_gc").select("id, storage_path").limit(500);
if (error) { console.error(error.message); process.exit(1); }

if (!queue?.length) {
  console.log("No orphaned files to remove.");
  process.exit(0);
}

const paths = queue.map((q) => q.storage_path);
const { error: rmErr } = await db.storage.from("item-photos").remove(paths);
if (rmErr) { console.error("Removal failed:", rmErr.message); process.exit(1); }

await db.from("storage_gc").delete().in("id", queue.map((q) => q.id));
console.log(`Removed ${paths.length} orphaned file(s).`);
