import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  buildWorkflowHandlerRegistry,
  type WorkflowHandlerRegistry
} from "../lib/workflows/contracts/step-handler";
import type { WorkflowHandler } from "../lib/workflows/contracts/step-handler";
import { ENRICH_LEAD_STEP_TYPE } from "../lib/workflows/step-handlers/enrich-lead-pure";

/**
 * The production registry pulls `@/lib/enrichment` + CRM adapters (which pull Next/server-only
 * chains) and is therefore not loadable from a node test runner for full execution tests.
 * We assert registry wiring via a static-source check on `lib/workflows/step-handlers/index.ts`.
 */
describe("WORKFLOW_HANDLER_REGISTRY — source contract", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const indexPath = join(here, "..", "lib", "workflows", "step-handlers", "index.ts");
  const indexSource = readFileSync(indexPath, "utf8");

  it("imports the enrichLeadStepHandler from ./enrich-lead", () => {
    assert.match(
      indexSource,
      /import\s+\{\s*enrichLeadStepHandler\s*\}\s+from\s+["']\.\/enrich-lead["']/
    );
  });

  it("registers enrichLeadStepHandler exactly once by its step_type", () => {
    const registryBlock = /WORKFLOW_HANDLER_REGISTRY[\s\S]*?\]\s*\)\s*;/.exec(indexSource);
    assert.ok(registryBlock, "registry literal not found in step-handlers/index.ts");
    assert.match(registryBlock[0], /\[\s*enrichLeadStepHandler\.stepType\s*,\s*enrichLeadStepHandler\s*\]/);
  });

  it("imports compose + CRM sync handlers", () => {
    assert.match(
      indexSource,
      /import\s+\{\s*composeCampaignDraftStepHandler\s*\}\s+from\s+["']\.\/compose-campaign-draft["']/
    );
    assert.match(
      indexSource,
      /import\s+\{\s*crmSyncHubspotStepHandler\s*\}\s+from\s+["']\.\/crm-sync-hubspot["']/
    );
    assert.match(
      indexSource,
      /import\s+\{\s*crmSyncSalesforceStepHandler\s*\}\s+from\s+["']\.\/crm-sync-salesforce["']/
    );
  });

  it("does NOT import legacy draft / send / webhook handler filenames", () => {
    const disallowedImports = ["compose-email-draft", "outbound-webhook", "send-email"];
    for (const name of disallowedImports) {
      assert.equal(
        new RegExp(`from\\s+["']\\./${name}["']`).test(indexSource),
        false,
        `step-handlers/index.ts unexpectedly imports ./${name}`
      );
    }
  });
});

describe("buildWorkflowHandlerRegistry (test seam)", () => {
  it("builds isolated registries from explicit handlers", () => {
    const stub: WorkflowHandler = {
      stepType: ENRICH_LEAD_STEP_TYPE,
      displayName: "Enrich lead (stub)",
      run: async () => ({ kind: "ok", output: {} })
    };
    const isolated: WorkflowHandlerRegistry = buildWorkflowHandlerRegistry([stub]);
    assert.equal(isolated.get(ENRICH_LEAD_STEP_TYPE), stub);
    assert.equal(isolated.size, 1);
    assert.equal(isolated.get("unknown_step"), undefined);
  });

  it("returns an empty registry from an empty handler list (used in unknown-step tests)", () => {
    const empty = buildWorkflowHandlerRegistry([]);
    assert.equal(empty.size, 0);
    assert.equal(empty.get(ENRICH_LEAD_STEP_TYPE), undefined);
  });
});
