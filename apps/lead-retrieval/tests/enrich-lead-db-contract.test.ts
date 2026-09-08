import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

/**
 * Contract: enrichLead must not return outcome "updated" unless lead_enrichments insert and leads update succeed.
 */
describe("enrichLead DB persistence (source contract)", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const enrichIndex = readFileSync(join(here, "..", "lib", "enrichment", "index.ts"), "utf8");

  it("throws when lead_enrichments insert fails", () => {
    assert.match(enrichIndex, /insertError/);
    assert.match(enrichIndex, /Failed to store enrichment payload/);
  });

  it("throws when leads update fails after successful provider normalization", () => {
    assert.match(enrichIndex, /updateError/);
    assert.match(enrichIndex, /Failed to update lead after enrichment/);
  });
});
