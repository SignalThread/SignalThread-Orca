import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));

const publishMaterializationSource = readFileSync(
  join(here, "..", "lib", "server", "import-wizard", "publish-leads-materialization.ts"),
  "utf8"
);

const briefingServiceSource = readFileSync(
  join(here, "..", "lib", "server", "import-wizard", "import-batch-briefing-service.ts"),
  "utf8"
);

describe("briefing to lead durable linkage + deterministic sync", () => {
  it("publish materialization stores linkage in briefing content JSON", () => {
    assert.ok(
      publishMaterializationSource.includes('from("import_batch_row_briefings")'),
      "publish flow should update import_batch_row_briefings"
    );
    assert.ok(
      publishMaterializationSource.includes("linkage") &&
        publishMaterializationSource.includes("published_lead_id: inserted.id"),
      "publish flow should persist batch-row -> lead linkage in content.linkage.published_lead_id"
    );
    assert.ok(
      publishMaterializationSource.includes("briefing linkage content update failed"),
      "publish flow should log linkage write failures"
    );
  });

  it("sync prefers linkage and uses email matching only as legacy fallback", () => {
    assert.ok(
      briefingServiceSource.includes("resolveLeadIdForApprovedBriefingSync"),
      "sync should use deterministic resolver helper"
    );
    assert.ok(
      briefingServiceSource.includes("getPublishedLeadLinkageId") &&
        briefingServiceSource.includes("linked_published_lead_id"),
      "resolver should prefer stored published lead linkage"
    );
    assert.ok(
      briefingServiceSource.includes("invalid_published_lead_linkage"),
      "bad published_lead_id must not fall through to email guessing"
    );
    assert.ok(
      briefingServiceSource.includes("legacy_email_fallback"),
      "fallback usage should be explicitly logged"
    );
    assert.ok(
      briefingServiceSource.includes("usedLegacyFallback") &&
        briefingServiceSource.includes("linkageReason"),
      "resolver should mark when fallback is used because linkage is missing/invalid"
    );
    assert.ok(
      briefingServiceSource.includes("deriveImportedLeadDisplayName") &&
        briefingServiceSource.includes("email_single_candidate_no_mapped_full_name"),
      "fallback should align with materialized lead display name when canonical full_name is empty"
    );
  });

  it("sync upserts lead_briefings using resolved lead linkage", () => {
    assert.ok(
      briefingServiceSource.includes('from("lead_briefings")') &&
        briefingServiceSource.includes("lead_id: resolvedLead.leadId"),
      "sync should upsert lead_briefings from resolved lead linkage"
    );
  });
});
