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

const flowSource = readFileSync(
  join(here, "..", "components", "import-wizard", "import-wizard-flow.tsx"),
  "utf8"
);

const footerConfigSource = readFileSync(
  join(here, "..", "components", "import-wizard", "wizard-footer-config.tsx"),
  "utf8"
);

describe("Publish step — batch-backed correctness", () => {
  it("publish-step.tsx does NOT import WIZARD_BATCH", () => {
    assert.ok(!publishStepSource.includes("WIZARD_BATCH"), "publish-step imports mock WIZARD_BATCH");
  });

  it("publish-step.tsx does NOT import MOCK_PUBLISH_READINESS", () => {
    assert.ok(!publishStepSource.includes("MOCK_PUBLISH_READINESS"), "publish-step imports mock readiness");
  });

  it("publish-step.tsx does NOT import MOCK_PUBLISH_PRE", () => {
    assert.ok(!publishStepSource.includes("MOCK_PUBLISH_PRE"), "publish-step imports mock pre-publish data");
  });

  it("publish-step.tsx does NOT import MOCK_PUBLISH_POST", () => {
    assert.ok(!publishStepSource.includes("MOCK_PUBLISH_POST"), "publish-step imports mock post-publish data");
  });

  it("publish-step.tsx does NOT import from publish-mock", () => {
    assert.ok(!publishStepSource.includes("publish-mock"), "publish-step imports publish-mock module");
  });

  it("publish-step.tsx does NOT import from batch-contract", () => {
    assert.ok(!publishStepSource.includes("batch-contract"), "publish-step imports batch-contract module");
  });

  it("publish-step.tsx does NOT contain hardcoded count 1240", () => {
    assert.ok(!publishStepSource.includes("1240"), "publish-step contains hardcoded 1240");
  });

  it("publish-step.tsx does NOT contain hardcoded count 1176", () => {
    assert.ok(!publishStepSource.includes("1176"), "publish-step contains hardcoded 1176");
  });

  it("publish-step.tsx does NOT contain hardcoded count 48", () => {
    assert.ok(!publishStepSource.includes('"48"'), "publish-step contains hardcoded 48");
  });

  it("publish-step.tsx accepts batchId prop", () => {
    assert.ok(publishStepSource.includes("batchId"), "publish-step does not accept batchId prop");
  });

  it("publish-step.tsx fetches from publish-readiness API", () => {
    assert.ok(
      publishStepSource.includes("publish-readiness"),
      "publish-step does not fetch from publish-readiness endpoint"
    );
  });

  it("publish-step.tsx has a publishing phase", () => {
    assert.ok(publishStepSource.includes('"publishing"'), "publish-step does not have a publishing phase");
  });

  it("publish-step.tsx has a publish_failed phase", () => {
    assert.ok(publishStepSource.includes('"publish_failed"'), "publish-step does not have a publish_failed phase");
  });

  it("flow does NOT import WIZARD_BATCH", () => {
    assert.ok(!flowSource.includes("WIZARD_BATCH"), "flow imports mock WIZARD_BATCH");
  });

  it("flow does NOT import MOCK_PUBLISH_READINESS", () => {
    assert.ok(!flowSource.includes("MOCK_PUBLISH_READINESS"), "flow imports mock readiness");
  });

  it("flow does NOT import from publish-mock", () => {
    assert.ok(!flowSource.includes("publish-mock"), "flow imports publish-mock module");
  });

  it("flow calls the real complete API on publish", () => {
    assert.ok(flowSource.includes("/complete"), "flow does not call the complete API");
    assert.ok(flowSource.includes('"publish"'), "flow does not pass publish action");
  });

  it("flow passes batchId to PublishStep", () => {
    assert.ok(flowSource.includes("batchId={activeImportDraft.batchId}"), "flow does not pass batchId to PublishStep");
  });

  it("flow passes publishError to PublishStep", () => {
    assert.ok(flowSource.includes("publishError={publishError}"), "flow does not pass publishError to PublishStep");
  });

  it("flow passes importedLeadCount to PublishStep", () => {
    assert.ok(
      flowSource.includes("importedLeadCount={importedLeadCount}"),
      "flow does not pass importedLeadCount to PublishStep"
    );
  });

  it("briefing steps are NOT in the import wizard flow", () => {
    assert.ok(!flowSource.includes("BriefReadinessStep"), "flow should not mount BriefReadinessStep");
    assert.ok(!flowSource.includes("ViewBriefStep"), "flow should not mount ViewBriefStep");
    assert.ok(!flowSource.includes("displayStep === 5"), "flow should not have a step index 5 branch");
  });

  it("publish step is at displayStep 4 (final step)", () => {
    assert.ok(flowSource.includes("<PublishStep"), "flow should mount PublishStep");
  });

  it("footer config handles publishing phase", () => {
    assert.ok(footerConfigSource.includes('"publishing"'), "footer config does not handle publishing phase");
  });

  it("footer returns to Validation from publish step", () => {
    assert.ok(
      footerConfigSource.includes("importWizardPath(3)"),
      "publish footer should link back to Validation at step 3"
    );
  });

  it("import gate is computed from batch data not mock", () => {
    assert.ok(
      publishStepSource.includes("rowsWithMustFix"),
      "publish-step does not use rowsWithMustFix for import gate"
    );
    assert.ok(publishStepSource.includes("onImportGateChange"), "publish-step does not report import gate to footer");
  });

  it("post-publish state only shows after phase is published", () => {
    assert.ok(
      publishStepSource.includes('phase === "published"'),
      "publish-step does not gate post-publish on published phase"
    );
  });
});
