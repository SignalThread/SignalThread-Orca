import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the single Email lead action uses the canonical provider-neutral endpoint", () => {
  const source = readFileSync("components/leads/follow-up-email-button.tsx", "utf8");
  const page = readFileSync("app/(app)/exhibitor/leads/[leadId]/page.tsx", "utf8");
  assert.match(source, /\/send-email`/);
  assert.doesNotMatch(source, /\/google\/send-email/);
  assert.match(source, /JSON\.stringify\(\{ idempotencyKey: key, subject, body \}\)/);
  assert.doesNotMatch(source, /JSON\.stringify\(\{[^}]*provider/);
  assert.doesNotMatch(source, /JSON\.stringify\(\{[^}]*recipient/);
  assert.match(source, /provider_selection_required/);
  assert.match(page, /resolveEmailProviderForUser/);
  assert.match(page, /FollowUpEmailButton/);
});

test("canonical and compatibility routes share exactly one handler", () => {
  const canonical = readFileSync("app/api/exhibitor/leads/[leadId]/send-email/route.ts", "utf8");
  const compatibility = readFileSync("app/api/exhibitor/leads/[leadId]/google/send-email/route.ts", "utf8");
  const handler = readFileSync("lib/integrations/email/send-route.ts", "utf8");
  for (const route of [canonical, compatibility]) {
    assert.match(route, /handleCanonicalEmailSend/);
    assert.doesNotMatch(route, /sendGoogleFollowUpEmail|sendFollowUpEmail\(/);
  }
  assert.match(handler, /resolveApiSession\(request\)/);
  assert.match(handler, /sendFollowUpEmail/);
  assert.match(handler, /activePlatformAdminCompanyId: session\.activeCompanyId/);
  assert.match(handler, /parseEmailProviderOverride\(payload\.providerOverride\)/);
  assert.doesNotMatch(handler, /payload\.provider(?!Override)/);
  assert.doesNotMatch(handler, /payload\.recipient/);
});

test("provider-neutral activity preserves history and stores no content or credentials", () => {
  const migration = readFileSync("test-fixtures/legacy-lr-migrations/0104_provider_neutral_email_send.sql", "utf8");
  const service = readFileSync("lib/integrations/email/send-service.ts", "utf8");
  assert.match(migration, /ALTER TABLE public\.google_email_activities RENAME TO email_activities/);
  assert.match(migration, /CREATE VIEW public\.google_email_activities/);
  assert.match(migration, /provider_message_id/);
  assert.match(migration, /microsoft_connection_id/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.email_activities FROM anon, authenticated|REVOKE ALL ON TABLE public\.google_email_activities FROM anon, authenticated/);
  assert.doesNotMatch(migration, /\bsubject\b\s+text/i);
  assert.doesNotMatch(migration, /\bbody\b\s+text/i);
  assert.doesNotMatch(service, /access_token_encrypted|refresh_token_encrypted/);
});

test("activity UI is provider-neutral and attributes the selected sender", () => {
  const source = readFileSync("components/leads/email-activity-list.tsx", "utf8");
  assert.match(source, />Email activity</);
  assert.match(source, /Google Workspace/);
  assert.match(source, /Microsoft 365/);
  assert.match(source, /activity\.provider/);
});

test("Integrations exposes compact card-level sender controls only when both providers can send", () => {
  const page = readFileSync("app/(app)/exhibitor/integrations/page.tsx", "utf8");
  const control = readFileSync("components/exhibitor/email-provider-preference.tsx", "utf8");
  const catalog = readFileSync("components/exhibitor/integrations-catalog-client.tsx", "utf8");
  const route = readFileSync("app/api/exhibitor/integrations/email-provider-preference/route.ts", "utf8");
  assert.match(page, /googleWorkspaceStatus\.capabilities\.gmailSend/);
  assert.match(page, /microsoft365Status\.capabilities\.mailSend/);
  assert.match(page, /getDefaultSenderControlsState/);
  assert.match(catalog, /DefaultSenderControl/);
  assert.match(control, /Default sender/);
  assert.doesNotMatch(control, /Default email sender/);
  assert.match(route, /getCurrentSessionUser/);
  assert.match(route, /isCompanyAccountAdminSession/);
  assert.doesNotMatch(route, /payload\?\.companyId|payload\?\.company_id/);
});
