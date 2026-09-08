import assert from "node:assert/strict";
import test from "node:test";

import { defaultInspectorTabForStep, inspectorTabSpecsForStep } from "../components/exhibitor/workflows/workflow-inspector-tabs";

test("enrichment inspector exposes configuration tabs only", () => {
  const tabs = inspectorTabSpecsForStep("enrich");

  assert.deepEqual(tabs, [
    { id: "providers", label: "Providers" },
    { id: "fields", label: "Fields" }
  ]);
  assert.equal(defaultInspectorTabForStep("enrich"), "providers");
});
