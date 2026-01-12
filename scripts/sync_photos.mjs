import dotenv from "dotenv";
dotenv.config({ path: ".env.sync" });

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_BUCKET;

if (!url || !key || !bucket) throw new Error("Missing env vars in .env.sync");

const supabase = createClient(url, key, { auth: { persistSession: false } });

const exts = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

async function listFolder(prefix = "") {
  const out = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const item of data) {
      const name = item.name;
      if (!name) continue;

      // If it has no metadata, it's usually a "folder"
      const isFolder = !item.metadata;

      if (isFolder) {
        const childPrefix = prefix ? `${prefix}/${name}` : name;
        const child = await listFolder(childPrefix);
        out.push(...child);
      } else {
        const lower = name.toLowerCase();
        const isImage = [...exts].some((e) => lower.endsWith(e));
        if (isImage) {
          out.push(prefix ? `${prefix}/${name}` : name);
        }
      }
    }

    if (data.length < limit) break;
    offset += limit;
  }

  return out;
}

async function upsert(paths) {
  const chunkSize = 500;
  for (let i = 0; i < paths.length; i += chunkSize) {
    const chunk = paths.slice(i, i + chunkSize).map((p) => ({
      storage_path: p,
      is_anchor: false,
      anchor_order: null,
    }));

    const { error } = await supabase.from("photos").upsert(chunk, { onConflict: "storage_path" });
    if (error) throw error;

    console.log(`Upserted ${Math.min(i + chunkSize, paths.length)} / ${paths.length}`);
  }
}

const ROOT_FOLDER = process.env.SUPABASE_FOLDER || "";

const paths = await listFolder(ROOT_FOLDER);
console.log(`Found ${paths.length} images in bucket ${bucket} under ${ROOT_FOLDER}`);
await upsert(paths);
console.log("Done.");