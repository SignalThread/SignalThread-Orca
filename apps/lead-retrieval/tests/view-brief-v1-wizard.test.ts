import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { buildBriefingDetailFromBatchRow } from "../lib/import-wizard/build-briefing-detail-from-batch-row";
import { IMPORT_WIZARD_STEPS } from "../lib/import-wizard/steps";
import { parseImportWizardStepParam } from "../lib/import-wizard/step-url";

const here = dirname(fileURLToPath(import.meta.url));

describe("View Brief v1 — standalone route (not wizard step)", () => {
  it("import wizard has 5 steps without briefing", () => {
    assert.equal(IMPORT_WIZARD_STEPS.length, 5);
    assert.equal(IMPORT_WIZARD_STEPS[0]?.id, "source_selection");
    assert.equal(IMPORT_WIZARD_STEPS[1]?.id, "field_mapping");
    assert.equal(IMPORT_WIZARD_STEPS[2]?.id, "enrichment");
    assert.equal(IMPORT_WIZARD_STEPS[3]?.id, "validation");
    assert.equal(IMPORT_WIZARD_STEPS[4]?.id, "import_complete");
  });

  it("parseImportWizardStepParam clamps to step 4", () => {
    assert.equal(parseImportWizardStepParam("99"), 4);
    assert.equal(parseImportWizardStepParam("4"), 4);
  });

  it("import-wizard-flow does NOT mount briefing steps", () => {
    const flow = readFileSync(join(here, "..", "components", "import-wizard", "import-wizard-flow.tsx"), "utf8");
    assert.ok(!flow.includes("BriefReadinessStep"), "flow should not import BriefReadinessStep");
    assert.ok(!flow.includes("ViewBriefStep"), "flow should not import ViewBriefStep");
  });

  it("view-brief-step does not reference regenerate", () => {
    const src = readFileSync(join(here, "..", "components", "import-wizard", "steps", "view-brief-step.tsx"), "utf8");
    assert.ok(!/regenerate/i.test(src), "view brief step should not mention regenerate");
  });

  it("view-brief-step links back to standalone briefings route, not wizard step", () => {
    const src = readFileSync(join(here, "..", "components", "import-wizard", "steps", "view-brief-step.tsx"), "utf8");
    assert.ok(src.includes("batchBriefingsPath"), "should use batchBriefingsPath for back link");
    assert.ok(!src.includes("importWizardPath"), "should not reference importWizardPath");
  });

  it("import-briefing-view-sections has grounded unknowns section (not fake gaps)", () => {
    const src = readFileSync(
      join(here, "..", "components", "import-wizard", "import-briefing-view-sections.tsx"),
      "utf8"
    );
    assert.ok(src.includes("deriveStrategicGaps"), "should use strategic gap derivation");
    assert.ok(src.includes("brief-unknowns-section"), "should have testid for unknowns section");
  });

  it("batch workspace readiness page exists under /exhibitor/briefings/[batchId]", () => {
    const page = readFileSync(
      join(here, "..", "app", "(app)", "exhibitor", "briefings", "[batchId]", "page.tsx"),
      "utf8"
    );
    assert.ok(page.includes("BatchBriefReadinessClient"), "page should render BatchBriefReadinessClient");
    assert.ok(page.includes("getBatchByIdForCompany"), "page should load batch by id");
  });

  it("legacy import /briefings path redirects to new batch workspace", () => {
    const page = readFileSync(
      join(here, "..", "app", "(app)", "exhibitor", "import", "[batchId]", "briefings", "page.tsx"),
      "utf8"
    );
    assert.ok(page.includes("redirect"), "should redirect");
    assert.ok(page.includes("batchBriefingsPath"), "to new workspace URL");
  });

  it("legacy /briefings/view redirects to /briefings/review", () => {
    const page = readFileSync(
      join(here, "..", "app", "(app)", "exhibitor", "import", "[batchId]", "briefings", "view", "page.tsx"),
      "utf8"
    );
    assert.ok(page.includes("redirect"), "legacy view page should redirect");
    assert.ok(page.includes("batchBriefingsReviewPath"), "should redirect to review path");
  });
});

describe("BriefingDetailView approvalStatus", () => {
  it("buildBriefingDetailFromBatchRow includes approvalStatus", () => {
    const v = buildBriefingDetailFromBatchRow(
      "brief-1",
      "row-uuid",
      0,
      ["Pat", "pat@x.com", "Eng", "Acme"],
      ["Name", "Email", "Title", "Company"],
      {
        "0": "full_name",
        "1": "email",
        "2": "job_title",
        "3": "company_text",
      },
      {},
      "approved"
    );
    assert.equal(v.approvalStatus, "approved");
  });
});
