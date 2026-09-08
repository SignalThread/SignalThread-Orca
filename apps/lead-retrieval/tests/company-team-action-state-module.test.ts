import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Regression: `CompanyTeamActionState` must not be a runtime export/import through
 * `app/app/settings/team-actions.ts` (`"use server"`) — Turbopack can emit
 * `ReferenceError: CompanyTeamActionState is not defined` on delete / hydrate.
 */

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

test("CompanyTeamActionState is defined in shared company-team-types (client + types)", () => {
  const typesSrc = read("lib/exhibitor/company-team-types.ts");
  assert.match(typesSrc, /export type CompanyTeamActionState/);
  assert.equal(typesSrc.includes("server-only"), false);
});

test("team-actions uses a file-local CompanyTeamActionState alias (no import/re-export of that name)", () => {
  const actionsSrc = read("app/app/settings/team-actions.ts");
  assert.match(actionsSrc, /^type CompanyTeamActionState = /m);
  assert.equal(actionsSrc.includes("export type { CompanyTeamActionState }"), false);
  assert.equal(actionsSrc.includes('from "@/lib/exhibitor/company-team-types"'), false);
  assert.equal(
    /import type \{ CompanyTeamActionState \}/.test(actionsSrc),
    false
  );
});

test("company-team-settings-client imports action state type only from company-team-types", () => {
  const clientSrc = read("app/app/settings/company-team-settings-client.tsx");
  assert.match(
    clientSrc,
    /import type \{[^}]*CompanyTeamActionState[^}]*\} from "@\/lib\/exhibitor\/company-team-types"/
  );
  const teamActionsImport = clientSrc.match(
    /import\s*\{\s*inviteCompanyMemberAction[\s\S]*?\}\s*from\s*["']\.\/team-actions["']/
  );
  assert.ok(teamActionsImport, "expected server-action import from ./team-actions");
  assert.equal(teamActionsImport[0].includes("CompanyTeamActionState"), false);
});

test("company-team-management uses shared CompanyTeamActionState (does not re-export its own alias)", () => {
  const mgmtSrc = read("lib/server/company-team-management.ts");
  assert.match(mgmtSrc, /import type \{ CompanyTeamActionState/);
  assert.match(mgmtSrc, /from "@\/lib\/exhibitor\/company-team-types"/);
  assert.equal(mgmtSrc.includes("export type CompanyTeamActionState ="), false);
});
