import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));

const publishStepSource = readFileSync(
  join(here, "..", "components", "import-wizard", "steps", "publish-step.tsx"),
  "utf8"
);

const publishReadinessSource = readFileSync(
  join(
    here,
    "..",
    "app",
    "api",
    "exhibitor",
    "import-wizard",
    "batches",
    "[batchId]",
    "publish-readiness",
    "route.ts"
  ),
  "utf8"
);

describe("Publish v1 — honest import step", () => {
  it("publish-readiness aggregates briefing approval counts from import_batch_row_briefings", () => {
    assert.ok(
      publishReadinessSource.includes('from("import_batch_row_briefings")'),
      "expected briefing table query"
    );
    assert.ok(
      publishReadinessSource.includes("briefingRowsApproved"),
      "expected briefingRowsApproved in response"
    );
    assert.ok(
      publishReadinessSource.includes("briefingRowsNotApproved"),
      "expected briefingRowsNotApproved in response"
    );
    assert.ok(
      publishReadinessSource.includes('.eq("approval_status", "approved")'),
      "expected approved count filter"
    );
  });

  it("publish-step does not fetch general leads list for a faux batch preview", () => {
    assert.ok(
      !publishStepSource.includes("/api/exhibitor/leads"),
      "publish-step should not call general leads API for success preview"
    );
  });

  it("publish-step explains leads land in the main list without a dedicated import filter", () => {
    assert.ok(
      publishStepSource.includes("isn&apos;t a separate") && publishStepSource.includes("saved view"),
      "expected user-facing note about list behavior"
    );
  });

  it("publish-step surfaces briefing stats as informational only", () => {
    assert.ok(
      publishStepSource.includes("import-wizard-publish-briefing-stats"),
      "expected briefing stats test id"
    );
    assert.ok(
      publishStepSource.includes("Import does") && publishStepSource.includes("not") && publishStepSource.includes("require brief approval"),
      "expected non-blocking briefing copy"
    );
  });

  it("import gate still blocks only on empty batch or must-fix rows", () => {
    assert.ok(
      publishStepSource.includes("data.totalRows === 0") && publishStepSource.includes("data.rowsWithMustFix > 0"),
      "expected readiness-based blocking only"
    );
    const blockedMatch = publishStepSource.match(/const blocked = ([^;]+);/);
    assert.ok(blockedMatch, "expected blocked const");
    const expr = blockedMatch![1];
    assert.ok(!expr.includes("briefing"), "blocking must not depend on briefing approval");
    assert.ok(!expr.includes("approved"), "blocking must not depend on approval counts");
  });

  it("success state does not imply operational post-publish briefs on leads", () => {
    assert.ok(
      publishStepSource.includes("not auto-attached") || publishStepSource.includes("AI Briefings"),
      "expected clear briefs handled separately from import success"
    );
  });

  it("success CTA links to standalone batch briefings route, not leads prepareBriefings", () => {
    assert.ok(
      publishStepSource.includes("batchBriefingsPath"),
      "expected batchBriefingsPath for briefings CTA"
    );
    assert.ok(
      !publishStepSource.includes("prepareBriefings"),
      "should not reference old prepareBriefings query param"
    );
  });
});
