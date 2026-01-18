import dotenv from "dotenv";
dotenv.config({ path: ".env.sync" });

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_BUCKET;
const ROOT_FOLDER = process.env.SUPABASE_FOLDER || "";

if (!url || !key || !bucket) {
  throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_BUCKET in .env.sync");
}

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
      const name = item?.name;
      if (!name) continue;

      // In Supabase storage list(), "folders" usually have null metadata
      const isFolder = !item.metadata;

      if (isFolder) {
        const childPrefix = prefix ? `${prefix}/${name}` : name;
        out.push(...(await listFolder(childPrefix)));
        continue;
      }

      const lower = name.toLowerCase();
      for (const ext of exts) {
        if (lower.endsWith(ext)) {
          out.push(prefix ? `${prefix}/${name}` : name);
          break;
        }
      }
    }

    if (data.length < limit) break;
    offset += limit;
  }

  return out;
}

async function upsertPaths(paths) {
  const chunkSize = 500;

  for (let i = 0; i < paths.length; i += chunkSize) {
    const chunk = paths.slice(i, i + chunkSize).map((p) => ({
      storage_path: p,
    }));

    // NOTE: this requires a UNIQUE constraint/index on photos.storage_path
    const { error } = await supabase.from("photos").upsert(chunk, { onConflict: "storage_path" });
    if (error) throw error;

    console.log(`Upserted ${Math.min(i + chunkSize, paths.length)} / ${paths.length}`);
  }
}

const paths = await listFolder(ROOT_FOLDER);
console.log(
  `Found ${paths.length} images in bucket ${bucket} under ${ROOT_FOLDER ? ROOT_FOLDER : "(root)"}`
);

await upsertPaths(paths);
console.log("Done.");
