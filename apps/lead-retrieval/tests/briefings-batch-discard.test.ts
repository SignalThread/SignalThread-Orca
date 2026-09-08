import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));

describe("Briefings run card — list delete affordance", () => {
  it("overflow menu exposes delete and client uses canonical discard API path", () => {
    const card = readFileSync(
      join(here, "..", "components", "exhibitor", "briefings-run-card.tsx"),
      "utf8"
    );
    assert.ok(card.includes("data-testid=\"briefings-batch-delete-run\""), "overflow menu delete item");
    assert.ok(card.includes("data-testid=\"briefings-batch-actions-trigger\""), "actions trigger discoverable");
    assert.ok(
      card.includes("/api/exhibitor/briefings/batches/") && card.includes("/discard"),
      "client posts to exhibitor briefings discard route"
    );
  });

  it("discard confirmation explains published runs do not remove roster leads", () => {
    const card = readFileSync(
      join(here, "..", "components", "exhibitor", "briefings-run-card.tsx"),
      "utf8"
    );
    assert.ok(
      card.includes("This run is live:") && card.includes("delete leads from your"),
      "modal copy for published runs should clarify lead roster impact"
    );
  });
});

describe("Briefings batch discard API", () => {
  it("discard route delegates to discardImportBatchForCompany", () => {
    const route = readFileSync(
      join(here, "..", "app", "api", "exhibitor", "briefings", "batches", "[batchId]", "discard", "route.ts"),
      "utf8"
    );
    assert.ok(route.includes("discardImportBatchForCompany"), "route should call service discard");
    assert.ok(route.includes("exhibitor_admin"), "route should require exhibitor_admin");
  });

  it("service exposes discard for draft and published only", () => {
    const svc = readFileSync(join(here, "..", "lib", "server", "import-wizard", "import-batch-service.ts"), "utf8");
    assert.ok(svc.includes("discardImportBatchForCompany"), "service should define discard helper");
    assert.ok(svc.includes("batch_already_discarded"), "should guard double discard");
    assert.ok(svc.includes('current.status === "draft"'), "should branch draft vs published patch");
  });
});
