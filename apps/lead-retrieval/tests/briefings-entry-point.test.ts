import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { EXHIBITOR_BRIEFINGS_PATH } from "../lib/import-wizard/paths";

const here = dirname(fileURLToPath(import.meta.url));

const sidebarSource = readFileSync(
  join(here, "..", "components", "layout", "sidebar.tsx"),
  "utf8"
);

const exhibitorNavSource = readFileSync(
  join(here, "..", "lib", "exhibitor", "exhibitor-app-nav.ts"),
  "utf8"
);

const briefingsLandingSource = readFileSync(
  join(here, "..", "app", "(app)", "exhibitor", "briefings", "page.tsx"),
  "utf8"
);

const briefingsLayoutSource = readFileSync(
  join(here, "..", "app", "(app)", "exhibitor", "briefings", "layout.tsx"),
  "utf8"
);

const briefingsBatchesPageSource = readFileSync(
  join(here, "..", "app", "(app)", "exhibitor", "briefings", "batches", "page.tsx"),
  "utf8"
);

const workspacesSectionSource = readFileSync(
  join(here, "..", "components", "exhibitor", "briefings-workspaces-section.tsx"),
  "utf8"
);

const pathsSource = readFileSync(
  join(here, "..", "lib", "import-wizard", "paths.ts"),
  "utf8"
);

describe("Briefings entry point v1", () => {
  it("EXHIBITOR_BRIEFINGS_PATH is /exhibitor/briefings", () => {
    assert.equal(EXHIBITOR_BRIEFINGS_PATH, "/exhibitor/briefings");
  });

  it("sidebar imports EXHIBITOR_BRIEFINGS_PATH", () => {
    assert.ok(
      sidebarSource.includes("EXHIBITOR_BRIEFINGS_PATH"),
      "sidebar should import the briefings path constant"
    );
  });

  it("event nav includes Briefings as a sub-item under Leads", () => {
    assert.ok(
      exhibitorNavSource.includes('label: "Briefings"'),
      "nav data should have a Briefings sub-item"
    );
    const leadsIdx = exhibitorNavSource.indexOf('label: "Leads"');
    const briefingsIdx = exhibitorNavSource.indexOf('label: "Briefings"');
    assert.ok(leadsIdx >= 0 && briefingsIdx > leadsIdx, "Briefings should appear after Leads in nav source");
  });

  it("event nav places Briefings after Import Wizard in subItems", () => {
    const importWizardIdx = exhibitorNavSource.indexOf('"Import Wizard"');
    const briefingsIdx = exhibitorNavSource.indexOf('"Briefings"');
    assert.ok(importWizardIdx >= 0, "Import Wizard should exist in nav data");
    assert.ok(briefingsIdx > importWizardIdx, "Briefings should come after Import Wizard");
  });

  it("event nav keeps Documents & Links after Briefings", () => {
    const briefingsIdx = exhibitorNavSource.indexOf('"Briefings"');
    const documentsIdx = exhibitorNavSource.indexOf('label: "Documents & Links"');
    assert.ok(documentsIdx > briefingsIdx, "Documents & Links should follow Briefings in nav source");
    assert.ok(exhibitorNavSource.includes('icon: "documents"'), "Documents & Links item should use documents icon");
  });

  it("Briefings root landing is unified hub (strategy + workspaces)", () => {
    assert.ok(briefingsLandingSource.includes("BriefingSetupClient"), "strategy block");
    assert.ok(briefingsLandingSource.includes("BriefingsWorkspacesSection"), "workspaces section");
  });

  it("Briefings layout uses the normal page shell without an extra full-page gradient wrapper", () => {
    assert.match(briefingsLayoutSource, /<PageShell>/);
    assert.doesNotMatch(briefingsLayoutSource, /min-h-\[70vh\]/);
    assert.doesNotMatch(briefingsLayoutSource, /bg-\[linear-gradient/);
    assert.doesNotMatch(briefingsLayoutSource, /exhibitor-briefings-layout/);
  });

  it("legacy /briefings/batches route redirects to unified hub", () => {
    assert.ok(briefingsBatchesPageSource.includes("redirect"), "redirect");
    assert.ok(briefingsBatchesPageSource.includes("EXHIBITOR_BRIEFINGS_PATH"), "to hub root");
  });

  it("workspaces section loads import_batches", () => {
    assert.ok(workspacesSectionSource.includes('from("import_batches")'), "query import_batches");
  });

  it("workspaces section uses run cards for primary navigation", () => {
    assert.ok(workspacesSectionSource.includes("BriefingsRunCard"), "BriefingsRunCard");
  });

  it("workspaces section shows empty state with Import Wizard link", () => {
    assert.ok(workspacesSectionSource.includes("IMPORT_WIZARD_BASE_PATH"), "Import Wizard link");
    assert.ok(workspacesSectionSource.includes("No workspaces yet"), "empty state copy");
  });

  it("workspaces section uses requireRole for auth", () => {
    assert.ok(
      workspacesSectionSource.includes('requireRole("exhibitor_admin")'),
      "require exhibitor_admin"
    );
  });

  it("prepareBriefings param is removed from paths helper", () => {
    assert.ok(
      !pathsSource.includes("prepareBriefings"),
      "paths.ts should no longer reference prepareBriefings"
    );
  });
});
