import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("catalog replaces Gmail placeholder with implemented Google Workspace management", () => {
  const catalog = readFileSync("lib/config/integration-catalog.ts", "utf8");
  assert.match(catalog, /name: "Google Workspace"/);
  assert.match(catalog, /provider: "google_workspace"/);
  assert.match(catalog, /connectRoute: "\/api\/exhibitor\/integrations\/google\/connect"/);
  assert.match(catalog, /manageRoute: "\/exhibitor\/integrations\/google-workspace"/);
});

test("management UI has connect, reconnect, capability, revoke, and disconnect states", () => {
  const panel = readFileSync("components/exhibitor/google-workspace-connection-panel.tsx", "utf8");
  assert.match(panel, /Connect Google Workspace/);
  assert.match(panel, /Reconnect Google Workspace/);
  assert.match(panel, /gmailSend/);
  assert.match(panel, /calendarEventsOwned/);
  assert.match(panel, /calendarFreeBusy/);
  assert.match(panel, /Revoke and disconnect/);
  assert.match(panel, /Permission required/);
  assert.match(panel, /connect\?reconnect=1/);
  assert.match(panel, /Calendar free\/busy checks are unavailable/);
});

test("partial grants block Calendar availability with a permission-required explanation", () => {
  const status = readFileSync("lib/integrations/google/connection-status.ts", "utf8");
  const meeting = readFileSync("components/leads/google-meeting-panel.tsx", "utf8");
  const integrationPage = readFileSync("app/(app)/exhibitor/integrations/google-workspace/page.tsx", "utf8");
  assert.match(status, /deriveGoogleWorkspaceConnectionHealth/);
  assert.match(status, /capabilities: health\.capabilities/);
  assert.match(meeting, /!calendarFreeBusy/);
  assert.match(meeting, /did not grant Calendar free\/busy permission/);
  assert.match(integrationPage, /permission_required/);
});
