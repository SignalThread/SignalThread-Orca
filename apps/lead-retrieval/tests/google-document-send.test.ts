import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("document send scopes document and lead, derives recipient, and reuses canonical email sending", () => {
  const source = read("lib/integrations/google/document-send-service.ts");
  assert.match(source, /\.eq\("id", input\.documentId\)[\s\S]*\.eq\("account_id", input\.companyId\)/);
  assert.match(source, /\.eq\("id", input\.leadId\)[\s\S]*\.eq\("company_id", input\.companyId\)/);
  assert.match(source, /canMutateExhibitorLeadsInContext/);
  assert.match(source, /denyExhibitorViewer: true/);
  assert.match(source, /String\(lead\.email/);
  assert.match(source, /sendFollowUpEmail/);
  assert.match(source, /documentId: document\.id/);
  assert.match(source, /id: sendId/);
});

test("document UI uses locked Google sender/recipient and keeps the non-Google fallback", () => {
  const source = read("components/exhibitor/documents-hub-client.tsx");
  assert.match(source, /googleWorkspace\.ready/);
  assert.match(source, /deliveryMode: "google"/);
  assert.match(source, /deliveryMode: "fallback"/);
  assert.match(source, /readOnly[\s\S]*googleWorkspace\.senderEmail/);
  assert.match(source, /readOnly[\s\S]*selectedLead\?\.email/);
  assert.match(source, /Confirm and send/);
  assert.match(source, /crypto\.randomUUID\(\)/);
});

test("document route never accepts a browser recipient and safe activity stores no content", () => {
  const route = read("app/api/exhibitor/documents/send/route.ts");
  const migration = read("test-fixtures/legacy-lr-migrations/0104_provider_neutral_email_send.sql");
  const googleBranch = route.slice(route.indexOf('payload.deliveryMode === "google"'), route.indexOf('console.log("[documents/send] request"'));
  assert.doesNotMatch(googleBranch, /payload\.recipientEmail/);
  assert.match(migration, /document_id/);
  assert.doesNotMatch(migration, /\bsubject\b\s+text/i);
  assert.doesNotMatch(migration, /\bbody\b\s+text/i);
  assert.doesNotMatch(route, /DOCUMENTS_SEND_PROVIDER_RESPONSE/);
});

test("tracked document access rejects invalid and expired sends", () => {
  const click = read("app/api/exhibitor/documents/sends/[sendId]/click/route.ts");
  assert.match(click, /\.eq\("id", sendId\)/);
  assert.match(click, /expires_at/);
  assert.match(click, /status: 410/);
  assert.match(click, /is_archived/);
});
