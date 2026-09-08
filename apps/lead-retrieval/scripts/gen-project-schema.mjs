import fs from "node:fs";

const TYPES_PATH = "types/database.ts";
const OUT_PATH = "docs/PROJECT_SCHEMA.md";

const TARGET_TABLES = [
  "events",
  "companies",
  "exhibitors",
  "licenses",
  "license_plans",
  "users",
  "event_users",
  "leads",
  "lead_enrichments",
];

function extractTableBlock(src, tableName) {
  const needle = `${tableName}: {`;
  const idx = src.indexOf(needle);
  if (idx === -1) return null;

  // Find the first "{" after "<tableName>:"
  const braceStart = src.indexOf("{", idx);
  if (braceStart === -1) return null;

  // Brace matching
  let depth = 0;
  let i = braceStart;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (depth === 0) {
      // include trailing "}" only, caller will format
      return src.slice(idx, i + 1);
    }
  }
  return null;
}

function extractEnumLikeTypes(src) {
  // Pull the exported type aliases near the top if they exist
  const lines = src.split("\n");
  const keep = [];
  for (const line of lines) {
    if (line.startsWith("export type ")) keep.push(line);
  }
  return keep.length ? keep.join("\n") : null;
}

function main() {
  if (!fs.existsSync(TYPES_PATH)) {
    console.error(`Missing ${TYPES_PATH}. Run: npx supabase gen types typescript --linked > ${TYPES_PATH}`);
    process.exit(1);
  }

  const src = fs.readFileSync(TYPES_PATH, "utf8");
  const enums = extractEnumLikeTypes(src);

  const sections = [];

  sections.push(`# Project Schema (Source of Truth)

This file is generated from the current Supabase TypeScript types and is intended to prevent schema drift in project context.

## How to refresh
Run one of these, then rerun the generator.

- Linked project:
  npx supabase gen types typescript --linked > types/database.ts

- Not linked (use your project id):
  npx supabase gen types typescript --project-id "$SUPABASE_PROJECT_ID" > types/database.ts

Then:
  node scripts/gen-project-schema.mjs

## Canonical relationships (current)
- events.id is the event scope key
- companies.id is the company scope key
- exhibitors is the join between event and company:
  exhibitors.id, exhibitors.event_id, exhibitors.company_id
- licenses belongs to a company and is event scoped:
  licenses.company_id, licenses.event_id, licenses.exhibitor_company_id
- users is the user identity row:
  users.id, users.role, users.company_id, users.license_id
- event_users is the membership and permission row:
  event_users.user_id, event_users.event_id, event_users.exhibitor_company_id, event_users.permissions, event_users.status

## Business rules (current intent)
- Platform Admin can create users and assign access.
- For now, newly created users should be status = invited in event_users.
- Exhibitor Admin requires exhibitor_company_id on event_users.
- Seat accounting ties back to licenses.seats_total and licenses.seats_used (do not invent new fields).
- Licenses represent the available seat pool. Inviting or activating a user should consume a seat (exact moment to finalize later).

## Types snapshot
`);

  if (enums) {
    sections.push(`### Exported type aliases (from types/database.ts)

\`\`\`ts
${enums}
\`\`\`
`);
  }

  sections.push(`### Tables (from types/database.ts)

The blocks below are copied directly from the generated Database type. If something looks wrong, regenerate types first.
`);

  for (const t of TARGET_TABLES) {
    const block = extractTableBlock(src, t);
    if (!block) {
      sections.push(`#### ${t}

Not found in ${TYPES_PATH}. Regenerate types and rerun this script.
`);
      continue;
    }

    sections.push(`#### ${t}

\`\`\`ts
${block}
\`\`\`
`);
  }

  sections.push(`## Notes
- Do not hand edit types/database.ts.
- When runtime errors reference missing columns, refresh types first, then fix queries.
`);

  fs.writeFileSync(OUT_PATH, sections.join("\n"), "utf8");
  console.log(`Wrote ${OUT_PATH}`);
}

main();
