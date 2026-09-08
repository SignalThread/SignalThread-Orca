import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getDefaultSenderControlsState } from "@/lib/integrations/email/default-sender-controls";

test("default sender controls are visible only when both email providers are healthy", () => {
  assert.deepEqual(
    getDefaultSenderControlsState({
      googleWorkspaceHealthy: true,
      microsoft365Healthy: false,
      preference: "google_workspace",
    }),
    { visible: false, googleWorkspaceSelected: false, microsoft365Selected: false },
  );
  assert.deepEqual(
    getDefaultSenderControlsState({
      googleWorkspaceHealthy: false,
      microsoft365Healthy: true,
      preference: "microsoft_365",
    }),
    { visible: false, googleWorkspaceSelected: false, microsoft365Selected: false },
  );
  assert.deepEqual(
    getDefaultSenderControlsState({
      googleWorkspaceHealthy: true,
      microsoft365Healthy: true,
      preference: null,
    }),
    { visible: true, googleWorkspaceSelected: false, microsoft365Selected: false },
  );
});

test("default sender controls reflect the persisted preference and retain it across a temporary unhealthy state", () => {
  assert.deepEqual(
    getDefaultSenderControlsState({
      googleWorkspaceHealthy: true,
      microsoft365Healthy: true,
      preference: "google_workspace",
    }),
    { visible: true, googleWorkspaceSelected: true, microsoft365Selected: false },
  );
  assert.deepEqual(
    getDefaultSenderControlsState({
      googleWorkspaceHealthy: true,
      microsoft365Healthy: true,
      preference: "microsoft_365",
    }),
    { visible: true, googleWorkspaceSelected: false, microsoft365Selected: true },
  );
  assert.deepEqual(
    getDefaultSenderControlsState({
      googleWorkspaceHealthy: true,
      microsoft365Healthy: false,
      preference: "microsoft_365",
    }),
    { visible: false, googleWorkspaceSelected: false, microsoft365Selected: false },
  );
});

test("the card controls persist a selected provider through the existing preference API without a standalone panel", () => {
  const page = readFileSync("app/(app)/exhibitor/integrations/page.tsx", "utf8");
  const catalog = readFileSync("components/exhibitor/integrations-catalog-client.tsx", "utf8");
  const control = readFileSync("components/exhibitor/email-provider-preference.tsx", "utf8");

  assert.match(page, /getDefaultSenderControlsState/);
  assert.doesNotMatch(page, /<EmailProviderPreference/);
  assert.match(catalog, /emailProviderPreference/);
  assert.match(catalog, /setEmailProviderPreference\(provider\)/);
  assert.match(catalog, /email-provider-preference/);
  assert.match(catalog, /JSON\.stringify\(\{ provider \}\)/);
  assert.match(catalog, /showDefaultSenderControls/);
  assert.match(control, /Default sender/);
  assert.match(control, /aria-pressed=\{selected\}/);
  assert.doesNotMatch(control, /Default email sender/);
});
