import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ALL_LEAD_IMPORT_OPTIONS,
  OPTIONAL_LEAD_IMPORT_KEYS,
  REQUIRED_LEAD_IMPORT_KEYS,
} from "../lib/import-wizard/lead-import-field-contract";

describe("lead-import-field-contract", () => {
  it("lists linkedin_url as optional canonical (never required for readiness)", () => {
    assert.ok(!(REQUIRED_LEAD_IMPORT_KEYS as readonly string[]).includes("linkedin_url"));
    assert.ok((OPTIONAL_LEAD_IMPORT_KEYS as readonly string[]).includes("linkedin_url"));
    assert.ok((ALL_LEAD_IMPORT_OPTIONS as readonly string[]).includes("linkedin_url"));
  });
});
