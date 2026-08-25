import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  ORCA_CANONICAL_TERMS,
  applyOrcaTerminologyToText,
  normalizeEventTerminologyOverrides,
} from "@/lib/orca-terminology-contract";

test("event terminology accepts only approved display labels and keeps safe defaults", () => {
  assert.deepEqual(normalizeEventTerminologyOverrides({}), { agenda: null, runOfShow: null, matrix: null, showFlow: null });
  assert.deepEqual(normalizeEventTerminologyOverrides({ agenda: " Matrix ", runOfShow: "Agenda", matrix: "Show Flow", showFlow: "Run of Show" }), {
    agenda: "Matrix", runOfShow: "Agenda", matrix: "Show Flow", showFlow: "Run of Show",
  });
  assert.throws(() => normalizeEventTerminologyOverrides({ agenda: "Schedule" }), /approved display term/);
  assert.throws(() => normalizeEventTerminologyOverrides({ matrix: 7 }), /text or null/);
  assert.equal(applyOrcaTerminologyToText("Run of Show and Show Flow help", { ...ORCA_CANONICAL_TERMS, runOfShow: "Matrix", showFlow: "Agenda" }), "Matrix and Agenda help");
});

test("terminology migration is additive, mirrored, and database-constrained", () => {
  const root = readFileSync("test-fixtures/legacy-orca-migrations/20260811190000_event_display_terminology/migration.sql", "utf8");
  const web = readFileSync("test-fixtures/legacy-orca-migrations/20260811190000_event_display_terminology/migration.sql", "utf8");
  assert.equal(root, web);
  assert.doesNotMatch(root, /\b(DROP|RENAME|TRUNCATE)\b/i);
  for (const field of ["agendaTerm", "runOfShowTerm", "matrixTerm", "showFlowTerm"]) assert.match(root, new RegExp(`ADD COLUMN "${field}" TEXT`));
  assert.equal((root.match(/IN \('Agenda', 'Run of Show', 'Matrix', 'Show Flow'\)/g) ?? []).length, 4);
});

test("stable technical contracts remain unchanged while display projections receive labels", () => {
  const shell = readFileSync("app/(shell)/events/[eventId]/_components/event-workspace-shell.tsx", "utf8");
  const publicRoute = readFileSync("app/api/public/events/[eventId]/agenda/route.ts", "utf8");
  const exportService = readFileSync("lib/operational-export-service.ts", "utf8");
  const ai = readFileSync("lib/executive-briefing.ts", "utf8");
  assert.match(shell, /href: `\/events\/\$\{eventId\}\/matrix`/);
  assert.match(publicRoute, /\{ agenda, displayLabel:/);
  assert.match(exportService, /terminology: terminology\.terms/);
  assert.match(ai, /label: terminology\.runOfShow/);
});

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

test("client modules have no runtime Prisma, server-service, secret, or Node imports", () => {
  const violations: string[] = [];
  for (const file of [...sourceFiles("app"), ...sourceFiles("components")]) {
    const source = readFileSync(file, "utf8");
    if (!/^\s*["']use client["'];/m.test(source)) continue;
    for (const match of source.matchAll(/^import\s+(?!type\b)([\s\S]*?)\s+from\s+["']([^"']+)["'];/gm)) {
      const specifiers = match[1] ?? "";
      const target = match[2] ?? "";
      const typeOnlySpecifiers = specifiers.startsWith("{") && specifiers.replace(/[{}\s,]/g, "").split("type").join("").length === 0;
      if (!typeOnlySpecifiers && (target === "@prisma/client" || target === "@/lib/prisma" || target.startsWith("@/src/server/") || target.startsWith("node:"))) violations.push(`${file}: ${target}`);
    }
    for (const env of source.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
      if (env[1] !== "NODE_ENV" && !env[1]?.startsWith("NEXT_PUBLIC_")) violations.push(`${file}: process.env.${env[1]}`);
    }
  }
  assert.deepEqual(violations, []);
  const roleEditor = readFileSync("app/platform/_components/platform-user-role-editor.tsx", "utf8");
  assert.doesNotMatch(roleEditor, /@prisma\/client|Object\.values\(UserRole\)/);
});

test("event settings resolves access before reading the event or terminology", () => {
  const page = readFileSync("app/(shell)/events/[eventId]/settings/page.tsx", "utf8");
  assert.ok(page.indexOf("resolveEventAccessForUser") < page.indexOf("getEventSettingsById(eventId)"));
  assert.ok(page.indexOf("resolveEventAccessForUser") < page.indexOf("getEventTerminology(eventId)"));
});
