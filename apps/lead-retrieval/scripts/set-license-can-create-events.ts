/**
 * One-off: set licenses.can_create_events for a specific license id.
 *
 *   npx tsx scripts/set-license-can-create-events.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (.env.local or env).
 */
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

import type { Database } from "@/types/database";

const LICENSE_ID = "23c24da9-98b4-47e8-aff0-c732279b3db1";
const EXHIBITOR_COMPANY_ID = "f7b7df1f-5318-4bc7-9511-00071af90821";

function loadEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => {
        const [key, ...rest] = l.split("=");
        let val = rest.join("=").trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        return [key.trim(), val];
      })
  );
}

function env(): { url: string; serviceKey: string } {
  const fileEnv = loadEnvFile(path.join(process.cwd(), ".env.local"));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || fileEnv["NEXT_PUBLIC_SUPABASE_URL"] || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv["SUPABASE_SERVICE_ROLE_KEY"] || "";
  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return { url, serviceKey };
}

async function main() {
  const { url, serviceKey } = env();
  const supabase = createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: before, error: readErr } = await supabase
    .from("licenses")
    .select("id, exhibitor_company_id, scope, can_create_events")
    .eq("id", LICENSE_ID)
    .maybeSingle();

  if (readErr) throw readErr;
  if (!before) {
    console.error("License not found:", LICENSE_ID);
    process.exit(1);
  }
  if (String(before.exhibitor_company_id) !== EXHIBITOR_COMPANY_ID) {
    console.error("exhibitor_company_id mismatch", before);
    process.exit(1);
  }

  const { data: after, error: updErr } = await supabase
    .from("licenses")
    .update({ can_create_events: true })
    .eq("id", LICENSE_ID)
    .eq("exhibitor_company_id", EXHIBITOR_COMPANY_ID)
    .select("id, can_create_events, scope, exhibitor_company_id")
    .maybeSingle();

  if (updErr) throw updErr;
  console.log(JSON.stringify({ before, after }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
