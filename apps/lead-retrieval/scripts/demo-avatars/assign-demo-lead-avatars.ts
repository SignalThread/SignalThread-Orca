/**
 * Assigns avatar_url on demo leads only (is_demo = true) using deterministic mapping:
 * same lead id always maps to the same file from public/demo-avatars/manifest.json.
 *
 * Requires: migration 0022 (avatar_url, is_demo), manifest from download-demo-avatars.ts,
 * and SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 *
 * Usage:
 *   npx tsx scripts/demo-avatars/assign-demo-lead-avatars.ts --company-id=<uuid>
 *
 * Optional:
 *   --dry-run   print planned updates without writing
 */
import { readFileSync } from "fs";
import { join } from "path";
import { createClient } from "@supabase/supabase-js";
import { leadIdStringHash } from "../../lib/leads/leadCardAvatar";

type Manifest = {
  version: number;
  files: string[];
  count: number;
};

function parseArgs() {
  const args = process.argv.slice(2);
  let companyId = "";
  let dryRun = false;
  for (const a of args) {
    if (a === "--dry-run") dryRun = true;
    else if (a.startsWith("--company-id=")) companyId = a.slice("--company-id=".length).trim();
  }
  return { companyId, dryRun };
}

function loadManifest(): Manifest {
  const path = join(process.cwd(), "public/demo-avatars/manifest.json");
  const raw = readFileSync(path, "utf8");
  const m = JSON.parse(raw) as Manifest;
  if (!Array.isArray(m.files) || m.files.length === 0) {
    throw new Error("Invalid manifest: run scripts/demo-avatars/download-demo-avatars.ts first.");
  }
  return m;
}

async function main() {
  const { companyId, dryRun } = parseArgs();
  if (!companyId) {
    console.error("Missing --company-id=<uuid> (demo tenant company only).");
    process.exit(1);
  }

  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.");
    process.exit(1);
  }

  const manifest = loadManifest();
  const files = [...manifest.files].sort();
  const n = files.length;

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: leads, error } = await supabase
    .from("leads")
    .select("id")
    .eq("company_id", companyId)
    .eq("is_demo", true);

  if (error) {
    console.error("Query failed:", error.message);
    process.exit(1);
  }

  if (!leads?.length) {
    console.error(
      "No demo leads found (is_demo = true for this company). Mark demo rows first, e.g. UPDATE leads SET is_demo = true WHERE ..."
    );
    process.exit(1);
  }

  const sorted = [...leads].sort((a, b) => a.id.localeCompare(b.id));

  for (const row of sorted) {
    const ix = leadIdStringHash(row.id) % n;
    const file = files[ix]!;
    const avatarUrl = `/demo-avatars/${file}`;

    if (dryRun) {
      console.log(`[dry-run] ${row.id} -> ${avatarUrl}`);
      continue;
    }

    const { error: upErr } = await supabase.from("leads").update({ avatar_url: avatarUrl }).eq("id", row.id);

    if (upErr) {
      console.error(`Update failed for ${row.id}:`, upErr.message);
      process.exit(1);
    }
    console.log(`Updated ${row.id} -> ${avatarUrl}`);
  }

  console.log(`Done. ${sorted.length} demo lead(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
