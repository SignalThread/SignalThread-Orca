import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));

describe("publish materialization applies wizard enrichment to leads insert", () => {
  const materializationSource = readFileSync(
    join(here, "..", "lib", "server", "import-wizard", "publish-leads-materialization.ts"),
    "utf8"
  );
  const rowsServiceSource = readFileSync(
    join(here, "..", "lib", "server", "import-wizard", "import-batch-rows-service.ts"),
    "utf8"
  );

  it("loads wizard_enrichment_normalized with batch rows", () => {
    assert.ok(rowsServiceSource.includes("wizard_enrichment_normalized"));
    assert.ok(rowsServiceSource.includes("wizardEnrichmentNormalized"));
  });

  it("merges wizard enrichment into lead insert before leads.insert", () => {
    assert.ok(materializationSource.includes("mergeWizardEnrichmentIntoLeadInsert"));
    assert.ok(materializationSource.includes("row.wizardEnrichmentNormalized"));
  });
});

describe("lead profile surfaces Enrich Data on Profile tab", () => {
  it("detail page wires EnrichLeadForm into lead detail top toolbar", () => {
    const pageSrc = readFileSync(
      join(here, "..", "app", "(app)", "exhibitor", "leads", "[leadId]", "page.tsx"),
      "utf8"
    );
    assert.ok(pageSrc.includes("EnrichLeadForm"));
    assert.ok(pageSrc.includes("Enrich Data"));
    assert.ok(pageSrc.includes("toolbarEnrich"));
    assert.ok(!pageSrc.includes("enrichAction"));
    assert.ok(!pageSrc.includes("Data Enrichment"));
  });

  it("profile card no longer switches tabs to enrichment", () => {
    const cardSrc = readFileSync(
      join(here, "..", "components", "leads", "exhibitor-lead-profile-card.tsx"),
      "utf8"
    );
    assert.ok(!cardSrc.includes('setTab("enrichment")'));
    assert.ok(!cardSrc.includes("useLeadDetailTabNavigation"));
    assert.ok(!cardSrc.includes("enrichAction"));
  });
});

describe("post-publish enrichLead path unchanged", () => {
  it("still inserts lead_enrichments and updates leads", () => {
    const enrichSrc = readFileSync(join(here, "..", "lib", "enrichment", "index.ts"), "utf8");
    assert.ok(enrichSrc.includes('.from("lead_enrichments")'));
    assert.ok(enrichSrc.includes('.from("leads")'));
    assert.ok(enrichSrc.includes(".update(updatePatch"));
  });
});
